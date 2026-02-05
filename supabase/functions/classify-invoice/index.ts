import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Eres un experto en clasificación y extracción de datos de facturas españolas. Analiza la factura y extrae TODA la información posible.

**PASO 1 - DETECCIÓN DE PROFORMA:**
PRIMERO, verifica si el documento es una PROFORMA. Busca las siguientes palabras en CUALQUIER IDIOMA:
- Español: "Proforma", "Factura Proforma", "Pro-forma"
- Inglés: "Proforma", "Pro forma Invoice", "Proforma Invoice"
- Francés: "Facture Proforma", "Pro forma"
- Alemán: "Proforma-Rechnung", "Proformarechnung"
- Italiano: "Fattura Proforma"
- Portugués: "Fatura Proforma"

Si detectas que es una PROFORMA, responde SOLO con:
{
  "invoice_type": "proforma",
  "operation_type": "no_aplica",
  "confidence": 0.95,
  "reasoning": "Documento identificado como proforma"
}

**SI NO ES PROFORMA, continúa con el análisis completo:**

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

**CLASIFICACIÓN DEL TIPO (EMITIDA/RECIBIDA):**

IMPORTANTE: Para determinar si la factura es "emitida" o "recibida", utiliza MÚLTIPLES fuentes de información:

1. **Análisis del LOGO**: 
   - Busca el logotipo de la empresa en la factura
   - El logo generalmente pertenece al EMISOR (quien emite la factura)
   - Compara el nombre/marca del logo con {{CLIENT_NAME}}
   - Si el logo coincide con {{CLIENT_NAME}}, es EMITIDA

2. **Posición del nombre**:
   - El EMISOR suele aparecer en la parte superior/izquierda, con membrete
   - El RECEPTOR aparece en el área de "Cliente:", "Facturar a:", "Bill to:"

3. **NIF/CIF**:
   - Compara el NIF del emisor y receptor con los datos conocidos de {{CLIENT_NAME}}

**Tipo**: 
- emitida: Si {{CLIENT_NAME}} es el Emisor (vende/presta servicio) - su logo/nombre aparece como quien factura
- recibida: Si {{CLIENT_NAME}} es el Receptor (compra/recibe servicio) - su nombre aparece como cliente

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
  "logo_detected": "Nombre de la empresa del logo detectado",
  "reasoning": "Breve explicación de la clasificación incluyendo cómo se usó el logo"
}`;

// Function to find the best matching account based on invoice description
async function findMatchingAccount(
  supabase: any,
  userId: string,
  invoiceDescription: string
): Promise<string | null> {
  // Get user's accounts
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("account_code, account_description")
    .eq("user_id", userId);

  if (error || !accounts || accounts.length === 0) {
    console.log("No accounts found for user or error:", error);
    return null;
  }

  console.log(`Found ${accounts.length} accounts for matching`);
  
  // Simple keyword matching - find best match based on description similarity
  const descLower = (invoiceDescription || "").toLowerCase();
  
  let bestMatch: { code: string; score: number } | null = null;
  
  for (const account of accounts) {
    const accountDescLower = account.account_description.toLowerCase();
    const accountWords = accountDescLower.split(/\s+/);
    
    // Count matching words
    let matchScore = 0;
    for (const word of accountWords) {
      if (word.length > 3 && descLower.includes(word)) {
        matchScore += 1;
      }
    }
    
    // Also check if account description contains invoice description keywords
    const invoiceWords = descLower.split(/\s+/);
    for (const word of invoiceWords) {
      if (word.length > 3 && accountDescLower.includes(word)) {
        matchScore += 1;
      }
    }
    
    if (matchScore > 0 && (!bestMatch || matchScore > bestMatch.score)) {
      bestMatch = { code: account.account_code, score: matchScore };
    }
  }
  
  return bestMatch?.code || null;
}

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

    // Check if user has any accounts for reconciliation
    const { data: userAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("user_id", invoice.user_id)
      .limit(1);
    
    const hasAccountBook = userAccounts && userAccounts.length > 0;
    console.log("User has account book:", hasAccountBook);

    const { data: signedUrlData } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 60);

    if (!signedUrlData?.signedUrl) {
      throw new Error("Could not get file URL");
    }

    const fileResponse = await fetch(signedUrlData.signedUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    
    // Convert to base64 without spread operator (avoids stack overflow for large files)
    const uint8Array = new Uint8Array(fileBuffer);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Data = btoa(binaryString);
    
    const mimeType = invoice.file_type === 'pdf' 
      ? 'application/pdf' 
      : 'image/jpeg';

    const systemPrompt = CLASSIFICATION_PROMPT.replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name);

    console.log("Sending request to Gemini for invoice:", invoiceId);

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
                { text: "Analiza esta factura. PRIMERO verifica si es una PROFORMA. Si no lo es, extrae toda la información. Presta especial atención al LOGO para identificar al emisor:" },
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

    // Handle proforma invoices - minimal data needed
    if (classification.invoice_type === 'proforma') {
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          invoice_type: 'proforma',
          operation_type: 'no_aplica',
          classification_status: "classified",
          assigned_account: null,
          classification_details: {
            confidence: classification.confidence || 0.95,
            raw_response: content,
            reasoning: classification.reasoning || "Documento identificado como proforma",
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
    }

    // Regular invoice processing
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
      'no_aplica',
      'otro'
    ];

    if (!validOperationTypes.includes(classification.operation_type)) {
      classification.operation_type = 'otro';
    }

    // Perform account reconciliation if user has account book
    let assignedAccount: string | null = null;
    if (hasAccountBook) {
      const description = classification.descripcion || '';
      assignedAccount = await findMatchingAccount(supabase, invoice.user_id, description);
      
      // If no match found, assign default account 555
      if (!assignedAccount) {
        assignedAccount = '555';
        console.log("No matching account found, assigning default: 555");
      } else {
        console.log("Matched account:", assignedAccount);
      }
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        invoice_type: classification.invoice_type,
        operation_type: classification.operation_type,
        classification_status: "classified",
        assigned_account: assignedAccount,
        classification_details: {
          confidence: classification.confidence,
          raw_response: content,
          reasoning: classification.reasoning,
          logo_detected: classification.logo_detected,
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
      JSON.stringify({ 
        success: true, 
        classification,
        assigned_account: assignedAccount 
      }),
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
