import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Eres un experto en clasificación y extracción de datos de facturas españolas. Analiza la factura y extrae TODA la información posible.

**INFORMACIÓN A EXTRAER:**

1. **Datos Generales:**
   - idioma: Idioma del documento (español, inglés, francés, etc.)
   - moneda: Código de moneda (EUR, USD, GBP, etc.)
   - fecha_factura: Fecha de emisión en formato YYYY-MM-DD
   - numero_factura: Número o código de la factura

2. **Importes:**
   - subtotal: Base imponible (sin IVA)
   - impuestos: Importe total de impuestos/IVA
   - porcentaje_iva: Porcentaje de IVA aplicado (21, 10, 4, 0)
   - total: Importe total de la factura

3. **Emisor (quien emite la factura):**
   - nombre_emisor: Nombre completo o razón social
   - id_emisor: NIF/CIF del emisor
   - direccion_emisor: Dirección completa
   - codigo_postal_emisor: Código postal

4. **Receptor (quien recibe la factura):**
   - nombre_receptor: Nombre completo o razón social
   - id_receptor: NIF/CIF del receptor
   - direccion_receptor: Dirección completa
   - codigo_postal_receptor: Código postal

5. **Otros:**
   - descripcion: Resumen breve del concepto/servicios (máx 100 caracteres)
   - factura_exenta: true si está exenta de IVA, false si no
   - motivo_exencion: Si está exenta, indicar el motivo (ej: "Art. 20 Ley IVA")

**CLASIFICACIÓN:**

**Tipo**: Determina si la factura es "emitida" o "recibida" basándote en el rol de {{CLIENT_NAME}}:
- emitida: Si {{CLIENT_NAME}} es el Emisor (vende/presta servicio)
- recibida: Si {{CLIENT_NAME}} es el Receptor (compra/recibe servicio)

**Operacion**: Clasifica según estas categorías:

1. **interiores_iva_deducible**: NIF emisor español, IVA desglosado o exenta por ley española
2. **facturas_compensaciones_agrarias**: Régimen Especial Agrario, IVA 10%
3. **adquisiciones_intracomunitarias_bienes**: Emisor UE (NL, LU, IE, FR, DE, IT...), BIENES físicos
4. **inversion_sujeto_pasivo**: "Reverse charge" o emisor fuera UE (CH, UK, US, NO, SE, IS)
5. **iva_no_deducible**: Factura no a nombre de la empresa o gastos personales
6. **adquisiciones_intracomunitarias_servicios**: Emisor UE, SERVICIOS (software, hotel, consultoría)
7. **importaciones**: Bienes de fuera UE con DUA
8. **suplidos**: Gastos adelantados por gestoría/asesoría
9. **kit_digital**: Subvención Kit Digital
10. **otro**: Solo si no encaja en ninguna categoría

Responde SOLO con JSON válido sin markdown:
{
  "invoice_type": "emitida|recibida",
  "operation_type": "categoria_exacta",
  "confidence": 0.0-1.0,
  "idioma": "español",
  "moneda": "EUR",
  "fecha_factura": "YYYY-MM-DD",
  "numero_factura": "XXX",
  "subtotal": 100.00,
  "impuestos": 21.00,
  "porcentaje_iva": 21,
  "total": 121.00,
  "nombre_emisor": "Empresa Emisora S.L.",
  "id_emisor": "B12345678",
  "direccion_emisor": "Calle...",
  "codigo_postal_emisor": "28001",
  "nombre_receptor": "Empresa Receptora S.L.",
  "id_receptor": "B87654321",
  "direccion_receptor": "Avenida...",
  "codigo_postal_receptor": "08001",
  "descripcion": "Servicios de consultoría",
  "factura_exenta": false,
  "motivo_exencion": null,
  "reasoning": "Breve explicación de la clasificación"
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

    const { data: signedUrlData } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 60);

    if (!signedUrlData?.signedUrl) {
      throw new Error("Could not get file URL");
    }

    const fileResponse = await fetch(signedUrlData.signedUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    
    const mimeType = invoice.file_type === 'pdf' 
      ? 'application/pdf' 
      : 'image/jpeg';

    const systemPrompt = CLASSIFICATION_PROMPT.replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name);

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
                { text: "Analiza y extrae toda la información de esta factura:" },
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
            maxOutputTokens: 2048,
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

    let classification;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      classification = JSON.parse(cleanContent);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

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

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        invoice_type: classification.invoice_type,
        operation_type: classification.operation_type,
        classification_status: "classified",
        classification_details: {
          confidence: classification.confidence,
          raw_response: content,
          reasoning: classification.reasoning,
          extracted_data: {
            idioma: classification.idioma,
            moneda: classification.moneda,
            fecha_factura: classification.fecha_factura,
            numero_factura: classification.numero_factura,
            subtotal: classification.subtotal,
            impuestos: classification.impuestos,
            porcentaje_iva: classification.porcentaje_iva,
            total: classification.total,
            nombre_emisor: classification.nombre_emisor,
            id_emisor: classification.id_emisor,
            direccion_emisor: classification.direccion_emisor,
            codigo_postal_emisor: classification.codigo_postal_emisor,
            nombre_receptor: classification.nombre_receptor,
            id_receptor: classification.id_receptor,
            direccion_receptor: classification.direccion_receptor,
            codigo_postal_receptor: classification.codigo_postal_receptor,
            descripcion: classification.descripcion,
            factura_exenta: classification.factura_exenta,
            motivo_exencion: classification.motivo_exencion,
          },
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
