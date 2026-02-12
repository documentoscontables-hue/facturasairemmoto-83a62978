import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Eres un experto en clasificación y extracción de datos de facturas españolas. Analiza el documento y extrae TODA la información posible.

**PASO 1 - DETECCIÓN DEL TIPO DE DOCUMENTO:**
Clasifica el documento en UNA de estas categorías:

1. **Factura Emitida (emitida)**: Factura donde {{CLIENT_NAME}} es el EMISOR (vende/presta servicio)
2. **Factura Recibida (recibida)**: Factura donde {{CLIENT_NAME}} es el RECEPTOR (compra/recibe servicio)
3. **Albarán (albaran)**: Documento de entrega. Palabras clave en cualquier idioma:
   - Español: "Albarán", "Albaran", "Albarán de entrega", "Nota de entrega"
   - Inglés: "Delivery Note", "Delivery Slip", "Packing Slip", "Dispatch Note"
   - Francés: "Bon de livraison", "Bordereau de livraison"
   - Alemán: "Lieferschein"
   - Italiano: "Bolla di consegna", "Documento di trasporto", "DDT"
   - Portugués: "Guia de remessa", "Nota de entrega"
4. **Proforma (proforma)**: Factura proforma. Palabras clave en cualquier idioma:
   - Español: "Proforma", "Factura Proforma", "Pro-forma"
   - Inglés: "Proforma", "Pro forma Invoice", "Proforma Invoice"
   - Francés: "Facture Proforma", "Pro forma"
   - Alemán: "Proforma-Rechnung", "Proformarechnung"
   - Italiano: "Fattura Proforma"
   - Portugués: "Fatura Proforma"
5. **Ticket (ticket)**: Recibo simplificado / ticket de compra.
   - Palabras clave: "Ticket", "Ticket de compra", "Recibo", "Recibo simplificado", "Receipt", "Sales Receipt", "Kassabon", "Kassenbon", "Scontrino", "Reçu"
   - ESTRUCTURA: Formato estrecho tipo rollo de papel, texto en columnas simples, líneas de productos con cantidades y precios, total al final, datos de establecimiento (supermercado, gasolinera, restaurante, tienda), dirección, fecha/hora, número de caja/terminal, forma de pago. NO tienen membrete formal, logotipo grande ni datos fiscales completos del receptor.
6. **No es Factura (no_es_factura)**: Cualquier documento que NO sea una factura, ni un albarán, ni una proforma, ni un ticket. Ejemplos: contratos, presupuestos, emails, documentos internos, extractos bancarios, nóminas, etc.

**REGLAS DETALLADAS PARA IDENTIFICAR UN TICKET (MUY IMPORTANTE):**
Clasifica como TICKET únicamente cuando el documento cumpla la MAYORÍA de estas características:
1. **No incluye datos del cliente**: No aparece nombre/razón social del cliente. No aparece NIF/CIF/DNI del cliente. No aparece dirección del cliente.
2. **No presenta elementos fiscales obligatorios de factura completa**: No hay "Número de factura" o "Factura Nº". No hay desglose de IVA (base imponible + tipo + cuota). El IVA suele aparecer como "IVA incluido" (propio de tickets).
3. **Formato típico de ticket**: Documento corto, vertical, similar a recibo. Texto de TPV, cajero o sistema POS. Mensajes típicos: "Gracias por su compra", "Total a pagar", "IVA incluido", "Cajero", "TPV", "Cambio".
4. **Si el documento muestra encabezado formal → NO ES TICKET**: Si dice "Factura", "Invoice", "Factura simplificada", "Factura proforma" → NO es ticket.
5. **Si aparece cualquier dato del cliente (nombre, NIF, dirección) → NO es ticket.**

**REGLAS DE DESCARTE PARA TICKETS (evitar confusiones):**
- ❌ NO confundir con FACTURA: Si existe proveedor + cliente + número de factura + IVA desglosado → NO es ticket.
- ❌ NO confundir con PROFORMA: Si contiene "Proforma"/"Factura proforma" + datos del cliente + número de documento → NO es ticket.
- ❌ NO confundir con ALBARÁN: Si contiene "Albarán"/"Delivery note"/"Packing slip" + información de entrega → NO es ticket.
- ❌ NO confundir con NO_ES_FACTURA: Solo clasifica como no_es_factura si no es factura, ni ticket, ni proforma, ni albarán (ej: correos, contratos, presupuestos, pantallazos, movimientos bancarios).

**⭐ REGLA DE ORO PARA TICKETS:** Si no hay datos del cliente → clasificar como TICKET, SALVO que el documento contenga la palabra "Factura", "Proforma" o "Albarán".

**REGLAS DE CLASIFICACIÓN DE TIPO (MUY IMPORTANTE, SEGUIR EN ORDEN):**
- PRIMERO: Busca si el documento contiene la palabra "Factura" (o "Invoice" en inglés, "Facture" en francés, "Rechnung" en alemán, "Fattura" en italiano). 
- Si el documento dice explícitamente "Factura" (o equivalente en otro idioma) Y tiene datos fiscales completos → es emitida o recibida
- Si NO dice "Factura" pero es un albarán → invoice_type = "albaran"
- Si NO dice "Factura" pero es una proforma → invoice_type = "proforma"
- Si NO dice "Factura" pero es un ticket/recibo → invoice_type = "ticket"
- Si NO dice "Factura" y NO es albarán, ni proforma, ni ticket → invoice_type = "no_es_factura"
- NUNCA clasificar como emitida o recibida un documento que no contenga la palabra "Factura" (o equivalente)
- APLICA la Regla de Oro de Tickets ANTES de clasificar como no_es_factura

**REGLAS DE OPERACIÓN:**
- Si invoice_type es "albaran" → operation_type = "no_aplica"
- Si invoice_type es "proforma" → operation_type = "no_aplica"
- Si invoice_type es "ticket" → operation_type = "ticket"
- Si invoice_type es "no_es_factura" → operation_type = "no_aplica"
- Si invoice_type es "emitida" o "recibida" → clasificar según las categorías de operación abajo

Si es PROFORMA, ALBARÁN o NO ES FACTURA, responde SOLO con:
{
  "invoice_type": "proforma|albaran|no_es_factura",
  "operation_type": "no_aplica",
  "confidence": 0.95,
  "reasoning": "Breve explicación"
}

**SI ES FACTURA (emitida/recibida) O TICKET, continúa con el análisis completo:**

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

**CLASIFICACIÓN DEL TIPO (EMITIDA/RECIBIDA) - REGLA PRINCIPAL E INVIOLABLE:**

REGLA ABSOLUTA (NUNCA VIOLAR):
- **EMITIDA**: SOLO si {{CLIENT_NAME}} es el EMISOR (quien vende/factura). El nombre del emisor DEBE coincidir con {{CLIENT_NAME}}.
- **RECIBIDA**: Si {{CLIENT_NAME}} NO es el emisor. Si el emisor es CUALQUIER otra empresa distinta de {{CLIENT_NAME}}, SIEMPRE es RECIBIDA.

DICHO DE OTRA FORMA:
- Si el emisor se llama "Empresa X" y {{CLIENT_NAME}} NO es "Empresa X" → ES RECIBIDA. SIN EXCEPCIONES.
- Si el emisor se llama "Empresa X" y {{CLIENT_NAME}} ES "Empresa X" → ES EMITIDA.
- NO IMPORTA si el receptor dice "CLIENTE" o está vacío. Lo ÚNICO que importa es si {{CLIENT_NAME}} coincide con el EMISOR.

PASOS OBLIGATORIOS:
1. **Identifica al EMISOR**: El emisor es quien aparece en el membrete/logo/parte superior de la factura, con sus datos fiscales principales.
2. **Compara EMISOR con {{CLIENT_NAME}}**:
   - ¿El nombre del EMISOR coincide o es similar a "{{CLIENT_NAME}}"? → invoice_type = "emitida"
   - ¿El nombre del EMISOR es DIFERENTE de "{{CLIENT_NAME}}"? → invoice_type = "recibida"
3. **NUNCA** clasifiques como "emitida" si el emisor no coincide con {{CLIENT_NAME}}, aunque el receptor diga "CLIENTE" o esté vacío.


**Operacion** (solo para facturas emitidas/recibidas): Clasifica según estas categorías:

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
  "invoice_type": "emitida|recibida|ticket|proforma|albaran|no_es_factura",
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

    // Fetch past corrections from feedback to improve classification
    const { data: feedbackData } = await supabase
      .from("classification_feedback")
      .select("original_invoice_type, original_operation_type, corrected_invoice_type, corrected_operation_type")
      .eq("user_id", invoice.user_id)
      .eq("is_correct", false)
      .order("created_at", { ascending: false })
      .limit(10);

    let feedbackPromptSection = "";
    if (feedbackData && feedbackData.length > 0) {
      const corrections = feedbackData.map((f: any, i: number) => 
        `  ${i + 1}. La IA clasificó como tipo="${f.original_invoice_type}", operación="${f.original_operation_type}" → El usuario corrigió a tipo="${f.corrected_invoice_type}", operación="${f.corrected_operation_type}"`
      ).join("\n");
      feedbackPromptSection = `\n\n**CORRECCIONES ANTERIORES DEL USUARIO (aprende de estos errores y NO los repitas):**\n${corrections}\n`;
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

    const systemPrompt = CLASSIFICATION_PROMPT.replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name) + feedbackPromptSection;

    console.log("Sending request to Gemini for invoice:", invoiceId);

    // Retry with exponential backoff for rate limits
    const MAX_RETRIES = 5;
    let aiData: any = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt },
                  { text: "Analiza esta factura. PRIMERO verifica si es una PROFORMA o un ALBARÁN. Si no lo es, extrae toda la información. Presta especial atención al LOGO para identificar al emisor:" },
                  { inline_data: { mime_type: mimeType, data: base64Data } },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 2048 },
          }),
        }
      );

      if (aiResponse.ok) {
        aiData = await aiResponse.json();
        break;
      }

      const status = aiResponse.status;
      const errorText = await aiResponse.text();

      // Retry on 429 (rate limit) or 503 (overloaded)
      if ((status === 429 || status === 503) && attempt < MAX_RETRIES) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 60000);
        console.log(`Gemini API ${status}, retrying in ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      console.error("Gemini API error:", status, errorText);
      throw new Error(`AI classification failed (status ${status})`);
    }

    if (!aiData) throw new Error("AI classification failed after retries");

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

    // Handle proforma, albaran and no_es_factura - minimal data needed
    if (classification.invoice_type === 'proforma' || classification.invoice_type === 'albaran' || classification.invoice_type === 'no_es_factura') {
      const docType = classification.invoice_type;
      const docLabels: Record<string, string> = {
        proforma: 'proforma',
        albaran: 'albarán',
        no_es_factura: 'no es factura',
      };
      const docLabel = docLabels[docType] || docType;
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          invoice_type: docType,
          operation_type: 'no_aplica',
          classification_status: "classified",
          assigned_account: null,
          classification_details: {
            confidence: classification.confidence || 0.95,
            raw_response: content,
            reasoning: classification.reasoning || `Documento identificado como ${docLabel}`,
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
      'ticket',
      'otro'
    ];

    // Force operation_type to "ticket" when invoice_type is "ticket"
    if (classification.invoice_type === 'ticket') {
      classification.operation_type = 'ticket';
    }

    if (!validOperationTypes.includes(classification.operation_type)) {
      classification.operation_type = 'otro';
    }

    // POST-CLASSIFICATION VALIDATION: Ensure emitida/recibida is correct based on client_name
    if (classification.invoice_type === 'emitida' || classification.invoice_type === 'recibida') {
      const clientNameLower = (invoice.client_name || '').toLowerCase().trim();
      const emisorLower = (classification.nombre_emisor || '').toLowerCase().trim();
      const receptorLower = (classification.nombre_receptor || '').toLowerCase().trim();

      const clientMatchesEmisor = emisorLower.includes(clientNameLower) || clientNameLower.includes(emisorLower);
      const clientMatchesReceptor = receptorLower.includes(clientNameLower) || clientNameLower.includes(receptorLower);

      if (classification.invoice_type === 'emitida' && !clientMatchesEmisor && clientMatchesReceptor) {
        console.log(`POST-VALIDATION FIX: Changed from emitida to recibida. Client "${invoice.client_name}" matches receptor "${classification.nombre_receptor}", not emisor "${classification.nombre_emisor}"`);
        classification.invoice_type = 'recibida';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección automática: el cliente "${invoice.client_name}" coincide con el receptor, no con el emisor, por lo tanto es recibida.]`;
      } else if (classification.invoice_type === 'recibida' && !clientMatchesReceptor && clientMatchesEmisor) {
        console.log(`POST-VALIDATION FIX: Changed from recibida to emitida. Client "${invoice.client_name}" matches emisor "${classification.nombre_emisor}", not receptor "${classification.nombre_receptor}"`);
        classification.invoice_type = 'emitida';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección automática: el cliente "${invoice.client_name}" coincide con el emisor, no con el receptor, por lo tanto es emitida.]`;
      } else if (!clientMatchesEmisor && !clientMatchesReceptor) {
        // Client doesn't match either - default to recibida (most common case: client receives invoices)
        console.log(`POST-VALIDATION: Client "${invoice.client_name}" doesn't match emisor "${classification.nombre_emisor}" nor receptor "${classification.nombre_receptor}". Defaulting to recibida.`);
        classification.invoice_type = 'recibida';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección automática: el cliente "${invoice.client_name}" no coincide con el emisor, se asume recibida.]`;
      }
    }

    // Perform account reconciliation if user has account book
    let assignedAccount: string | null = null;
    if (hasAccountBook) {
      const description = classification.descripcion || '';
      assignedAccount = await findMatchingAccount(supabase, invoice.user_id, description);
      
      // If no match found, assign default account 555
      if (!assignedAccount) {
        assignedAccount = 'NO ENCONTRADO';
        console.log("No matching account found, assigning: NO ENCONTRADO");
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
