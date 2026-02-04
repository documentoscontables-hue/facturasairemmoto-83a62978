import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Eres un experto en clasificación de facturas españolas. Analiza la factura y determina:

**Tipo**: Determina si la factura es "Emitida" o "Recibida" basándote exclusivamente en el rol de la entidad {{CLIENT_NAME}}:
- Emitida (Venta): Si {{CLIENT_NAME}} aparece como el Emisor/Vendedor (quien presta el servicio o vende el producto y recibe el dinero).
- Recibida (Compra): Si {{CLIENT_NAME}} aparece como el Receptor/Cliente (quien adquiere el servicio/producto y paga el dinero).

Instrucción Crítica: Antes de clasificar, identifica quién es el emisor y quién es el receptor en el documento. Si el emisor coincide con {{CLIENT_NAME}}, etiqueta como "Emitida". De lo contrario, etiqueta como "Recibida".

**Operacion**: Identifica el tipo de operación contable según las siguientes opciones:

1. **interiores_iva_deducible**: 
   - NIF/CIF del emisor español (ESB..., B..., A...)
   - IVA desglosado al 21%, 10% o 4% O exenta con normativa española
   - NO menciona "Reverse charge" ni "Inversión del sujeto pasivo"

2. **facturas_compensaciones_agrarias**: 
   - Actividad del emisor: agricultor o ganadero
   - IVA al 10% con mención a "Régimen Especial Agrario"

3. **adquisiciones_intracomunitarias_bienes**: 
   - NIF del EMISOR de otro país UE (IE..., LU..., NL..., FR..., DE..., IT...)
   - NIF del RECEPTOR español (ESB...)
   - Se trata de BIENES (productos físicos, mercancías)
   - IVA 0% o "Intra-Community supply"

4. **inversion_sujeto_pasivo**: 
   - Texto explícito: "Inversión del sujeto pasivo" o "Reverse charge"
   - O emisor de FUERA de la UE (Suiza CH, UK post-Brexit, USA, Noruega NO, Suecia SE, Islandia IS)

5. **iva_no_deducible**: 
   - Factura NO a nombre de la empresa española
   - O gastos que NO corresponden a actividad empresarial

6. **adquisiciones_intracomunitarias_servicios**: 
   - SERVICIOS (NO bienes) de empresa UE
   - NIF del prestador: código país UE + número
   - Servicios: alojamiento, software, consultoría, marketing, plataformas

7. **importaciones**: 
   - Bienes de FUERA de la UE (China, USA, UK post-Brexit)
   - Documentación: factura comercial + DUA

8. **suplidos**: 
   - Gastos adelantados por gestoría/asesoría
   - Desglosa honorarios propios + suplidos

9. **kit_digital**: 
   - Mención a "Kit Digital", "Bono Kit Digital"
   - Mejoras digitales: web, e-commerce, software

10. **otro**: ÚLTIMA OPCIÓN si no encaja en ninguna categoría

INSTRUCCIONES CRÍTICAS:
PASO 1 - Identificar país del EMISOR por NIF
PASO 2 - Si es UE, distinguir BIENES vs SERVICIOS
PASO 3 - Verificar menciones "Reverse charge"
PASO 4 - Suecia, Noruega, Islandia, Suiza, UK = fuera UE fiscal

Responde SOLO con JSON válido sin markdown:
{
  "invoice_type": "emitida|recibida",
  "operation_type": "categoria_exacta",
  "confidence": 0.0-1.0,
  "vendor": "nombre del emisor",
  "amount": numero,
  "date": "YYYY-MM-DD",
  "invoice_number": "numero",
  "emisor_nif": "NIF del emisor",
  "receptor_nif": "NIF del receptor",
  "reasoning": "breve explicación de la clasificación"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    if (!invoice.client_name) {
      throw new Error("El nombre del cliente es requerido para clasificar");
    }

    // Get signed URL for the file
    const { data: signedUrlData } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 60);

    if (!signedUrlData?.signedUrl) {
      throw new Error("Could not get file URL");
    }

    // Download the file to get base64
    const fileResponse = await fetch(signedUrlData.signedUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    
    const mimeType = invoice.file_type === 'pdf' 
      ? 'application/pdf' 
      : 'image/jpeg';

    // Replace client name in prompt
    const systemPrompt = CLASSIFICATION_PROMPT.replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name);

    // Call Gemini API directly
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                { text: "Clasifica esta factura:" },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error("AI classification failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI Response:", content);

    // Parse the response
    let classification;
    try {
      // Remove potential markdown code blocks
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      classification = JSON.parse(cleanContent);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    // Validate operation_type
    const validOperationTypes = [
      'interiores_iva_deducible',
      'facturas_compensaciones_agrarias',
      'adquisiciones_intracomunitarias_bienes',
      'inversion_sujeto_pasivo',
      'iva_no_deducible',
      'adquisiciones_intracomunitarias_servicios',
      'importaciones',
      'suplidos',
      'kit_digital',
      'otro'
    ];

    if (!validOperationTypes.includes(classification.operation_type)) {
      classification.operation_type = 'otro';
    }

    // Update invoice with classification
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        invoice_type: classification.invoice_type,
        operation_type: classification.operation_type,
        classification_status: "classified",
        classification_details: {
          confidence: classification.confidence,
          raw_response: content,
          extracted_data: {
            vendor: classification.vendor,
            amount: classification.amount,
            date: classification.date,
            invoice_number: classification.invoice_number,
            emisor_nif: classification.emisor_nif,
            receptor_nif: classification.receptor_nif,
          },
          reasoning: classification.reasoning,
        },
      })
      .eq("id", invoiceId);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, classification }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Classification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
