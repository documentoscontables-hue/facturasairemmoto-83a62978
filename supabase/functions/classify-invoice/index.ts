import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFICATION_PROMPT = `Eres un experto en clasificación y extracción de datos de facturas españolas. Analiza el documento y extrae TODA la información posible.

**DATOS DEL CLIENTE:**
- Nombre del Cliente: {{CLIENT_NAME}}
- NIF/CIF del Cliente: {{CLIENT_NIT}}

**PROTOCOLO DE CLASIFICACIÓN DE TIPO (ORDEN JERÁRQUICO OBLIGATORIO):**

Evalúa cada documento siguiendo este orden estricto:

**PASO 1 - Validación de Identidad (Filtro de Ticket):**
Busca en el documento impreso tanto el Nombre del Cliente ({{CLIENT_NAME}}) como el NIF/CIF del Cliente ({{CLIENT_NIT}}).
- **Regla:** Si NI el nombre NI el NIF/CIF del cliente aparecen impresos en el documento, clasifícalo inmediatamente como **Ticket** (invoice_type = "ticket", operation_type = "ticket").
- EXCEPCIÓN: Si el documento contiene la palabra "Factura", "Proforma" o "Albarán", NO es ticket aunque no aparezcan datos del cliente.

**PASO 2 - Documentos Provisionales:**
Si se identifica al cliente (por nombre o NIF/CIF), verifica si el documento indica:
- "Albarán" / "Delivery Note" / "Packing Slip" → invoice_type = "albaran", operation_type = "no_aplica"
- "Proforma" / "Factura Proforma" / "Pro forma Invoice" → invoice_type = "proforma", operation_type = "no_aplica"

**PASO 3 - Validación de Factura:**
Si no es ticket, ni albarán, ni proforma:
- Si NO aparece el término "Factura" (o equivalente: "Invoice", "Facture", "Rechnung", "Fattura") → invoice_type = "no_es_factura", operation_type = "no_aplica"
- Si SÍ aparece: Clasificar como Factura Emitida o Factura Recibida según el rol del cliente.

Si es PROFORMA, ALBARÁN, TICKET o NO ES FACTURA, responde SOLO con:
{
  "invoice_type": "ticket|proforma|albaran|no_es_factura",
  "operation_type": "ticket|no_aplica",
  "confidence": 0.95,
  "reasoning": "Breve explicación en español"
}

**SI ES FACTURA (emitida/recibida), continúa con el análisis completo:**

**CLASIFICACIÓN EMITIDA/RECIBIDA - REGLA ABSOLUTA:**
- **EMITIDA**: SOLO si {{CLIENT_NAME}} o {{CLIENT_NIT}} coincide con el EMISOR.
- **RECIBIDA**: Si {{CLIENT_NAME}} y {{CLIENT_NIT}} NO coinciden con el emisor.
- El EMISOR es quien aparece en el membrete/logo/parte superior con sus datos fiscales.
- NUNCA clasificar como "emitida" si el emisor no coincide con el cliente.

**CLASIFICACIÓN DE TIPO DE OPERACIÓN:**

**A. Prioridad por Texto (aplica a Emitidas y Recibidas):**
Si detectas estas frases, la categoría es inmediata:
- "Inversión del Sujeto Pasivo" / "Art. 84 LIVA" / "Reverse Charge" → **inversion_sujeto_pasivo**
- "Suplido" / "Gasto por cuenta del cliente" → **suplidos**
- "Régimen especial agricultura" / "Compensación agraria" → **facturas_compensaciones_agrarias**
- "Kit Digital" / "Red.es" / "Acelera Pyme" → **kit_digital**
- Factura de Amazon (emisor es Amazon, Amazon EU, Amazon Services, etc.) → **amazon**

**B. Lógica Geográfica para FACTURAS RECIBIDAS:**
Identifica el país del emisor (proveedor):

- **España:** Gasto afecto a actividad con IVA → **interiores_iva_deducible**. Gastos personales/multas/no deducibles → **iva_no_deducible**.
- **Unión Europea (27 países miembros actuales):** Bienes físicos/logística → **adquisiciones_intracomunitarias_bienes**. Software/SaaS/Servicios → **adquisiciones_intracomunitarias_servicios**.
- **Extracomunitario (fuera UE: UK, Suiza, USA, Colombia, México, etc.):** Clasificar siempre como **importaciones** (salvo que mencione ISP explícitamente).

**C. Lógica Geográfica para FACTURAS EMITIDAS:**
Si no aplica ninguna regla de texto especial (ISP, Suplidos, etc.), clasificar como **no_aplica**.

**REGLAS DE CONTROL INTERNO:**
- Países UE: Solo los 27 miembros actuales. UK, Suiza, Noruega, Colombia son Extracomunitarios.
- Idioma: El razonamiento DEBE ser 100% en español.
- Contexto: El cliente siempre se considera de España o Islas Canarias.

**INFORMACIÓN A EXTRAER:**
1. Datos Generales: idioma, moneda, fecha_factura (YYYY-MM-DD), numero_factura
2. Importes: subtotal, impuestos, porcentaje_iva, total
3. Emisor: nombre_emisor, id_emisor, direccion_emisor, codigo_postal_emisor
4. Receptor: nombre_receptor, id_receptor, direccion_receptor, codigo_postal_receptor
5. Otros: descripcion (máx 100 chars), factura_exenta, motivo_exencion

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
  "reasoning": "Breve explicación en español"
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

    const clientNit = (invoice as any).client_nit || '';

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

    const systemPrompt = CLASSIFICATION_PROMPT
      .replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name)
      .replace(/\{\{CLIENT_NIT\}\}/g, clientNit || 'No proporcionado')
      + feedbackPromptSection;

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
      'amazon',
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
      const clientNitLower = (clientNit || '').toLowerCase().trim();
      const emisorLower = (classification.nombre_emisor || '').toLowerCase().trim();
      const receptorLower = (classification.nombre_receptor || '').toLowerCase().trim();
      const idEmisorLower = (classification.id_emisor || '').toLowerCase().trim();
      const idReceptorLower = (classification.id_receptor || '').toLowerCase().trim();

      const clientMatchesEmisor = (emisorLower.includes(clientNameLower) || clientNameLower.includes(emisorLower))
        || (clientNitLower && (idEmisorLower === clientNitLower));
      const clientMatchesReceptor = (receptorLower.includes(clientNameLower) || clientNameLower.includes(receptorLower))
        || (clientNitLower && (idReceptorLower === clientNitLower));

      if (classification.invoice_type === 'emitida' && !clientMatchesEmisor && clientMatchesReceptor) {
        console.log(`POST-VALIDATION FIX: Changed from emitida to recibida.`);
        classification.invoice_type = 'recibida';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección automática: el cliente coincide con el receptor, no con el emisor.]`;
      } else if (classification.invoice_type === 'recibida' && !clientMatchesReceptor && clientMatchesEmisor) {
        console.log(`POST-VALIDATION FIX: Changed from recibida to emitida.`);
        classification.invoice_type = 'emitida';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección automática: el cliente coincide con el emisor.]`;
      } else if (!clientMatchesEmisor && !clientMatchesReceptor) {
        console.log(`POST-VALIDATION: Client doesn't match either. Defaulting to recibida.`);
        classification.invoice_type = 'recibida';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección automática: el cliente no coincide con el emisor, se asume recibida.]`;
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
