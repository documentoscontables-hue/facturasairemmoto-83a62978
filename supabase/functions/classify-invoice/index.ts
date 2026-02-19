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
- **Regla ABSOLUTA:** Si NI el nombre NI el NIF/CIF del cliente aparecen impresos en el documento, clasifícalo inmediatamente como **Ticket** (invoice_type = "ticket", operation_type = "ticket"). Esta regla NO tiene excepciones: aunque el documento diga "Factura", "Proforma" o "Albarán", si no aparecen los datos del cliente, es Ticket.

**PASO 2 - Documentos Provisionales:**
Si se identifica al cliente (por nombre o NIF/CIF), verifica si el documento indica:
- "Albarán" / "Delivery Note" / "Packing Slip" / "Nota de entrega" / "Bon de livraison" / "Lieferschein" → invoice_type = "albaran", operation_type = "no_aplica"
- "Proforma" / "Factura Proforma" / "Pro forma Invoice" / "Pro-forma" → invoice_type = "proforma", operation_type = "no_aplica"

**PASO 3 - Filtro de Documentos No-Factura (CRÍTICO - ejecutar ANTES del PASO 4):**
Si no es ticket, ni albarán, ni proforma, ANTES de verificar si dice "Factura", comprueba si el TÍTULO PRINCIPAL o ENCABEZADO PRINCIPAL del documento es uno de estos tipos que NO son facturas. IMPORTANTE: aunque contengan la palabra "factura" en campos secundarios como "dirección de facturación", "datos de facturación", "bill to", "invoice address", etc., eso NO los convierte en factura.

Tipos NO-FACTURA (clasifica como invoice_type = "no_es_factura", operation_type = "no_aplica" si el encabezado principal coincide):
- **Pedido** / "Orden de compra" / "Purchase Order" / "P.O." / "Order" / "Order Confirmation" / "Confirmación de pedido" / "Bestellung" / "Bon de commande" / "Commande" / "Ordinazione"
- **Presupuesto** / "Quotation" / "Quote" / "Estimate" / "Angebot" / "Devis" / "Offerta" / "Oferta"
- **Nota de crédito** / "Credit Note" / "Credit Memo" / "Abono" / "Nota de Abono" / "Gutschrift" / "Avoir" / "Nota di credito"
- **Nota de débito** / "Debit Note" / "Debit Memo" / "Lastschrift"
- **Recibo** / "Receipt" / "Quittung" / "Reçu" / "Ricevuta" (sin estructura fiscal de factura)
- **Contrato** / "Contract" / "Agreement" / "Vertrag" / "Contrat"
- **Certificado** / "Certificate" / "Zertifikat" / "Certificat"
- **Extracto** / "Statement" / "Account Statement" / "Kontoauszug" / "Relevé de compte"
- **Remesa** / "Remittance" / "Remittance Advice"
- **Justificante de pago** / "Payment Confirmation" / "Proof of Payment" / "Payment Receipt" / "Zahlungsbestätigung"
- **Carta** / "Letter" / "Comunicación" / "Notification"
- **Aviso de envío** / "Shipping Notice" / "Dispatch Note" / "Versandanzeige"

**PASO 4 - Validación de Factura (multi-idioma):**
Si no fue filtrado en los pasos anteriores, verifica si el término que identifica al documento como factura aparece como TÍTULO o ENCABEZADO PRINCIPAL:
- Español: "Factura", "Factura simplificada"
- Inglés: "Invoice", "Tax Invoice", "VAT Invoice", "Commercial Invoice"
- Francés: "Facture", "Facture de TVA"
- Alemán: "Rechnung", "Steuerrechnung"
- Italiano: "Fattura", "Fattura elettronica"
- Portugués: "Fatura", "Factura"
- Neerlandés: "Factuur"
- Polaco: "Faktura"
- Rumano: "Factură"
- Cualquier otro idioma equivalente a "Factura Fiscal"

Si SÍ aparece uno de estos términos como TÍTULO PRINCIPAL → clasificar como Factura Emitida o Recibida.
Si NO aparece ninguno como título principal → invoice_type = "no_es_factura", operation_type = "no_aplica".

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

**A. Prioridad por Texto Explícito (REGLAS ESTRICTAS):**

⚠️ INVERSIÓN DEL SUJETO PASIVO: ÚNICAMENTE clasifica como "inversion_sujeto_pasivo" si el documento contiene EXPLÍCITAMENTE la frase legal: "Operación con inversión del sujeto pasivo conforme al Art. 84 (Uno. 2º) de la Ley 37/1992 de IVA" o una referencia directa y explícita al "Art. 84 LIVA" o "Reverse Charge (Art. 84 LIVA)". NO uses esta categoría solo porque no haya IVA o porque el proveedor sea extranjero.

- "Suplido" / "Gasto por cuenta del cliente" → **suplidos**
- "Régimen especial agricultura" / "Compensación agraria" → **facturas_compensaciones_agrarias**
- "Kit Digital" / "Red.es" / "Acelera Pyme" → **kit_digital**
- Factura de Amazon (emisor es Amazon, Amazon EU, Amazon Services, etc.) → **amazon**

**B. Lógica Geográfica para FACTURAS RECIBIDAS:**
Identifica el país del emisor (proveedor):

- **España:** Gasto afecto a actividad con IVA → **interiores_iva_deducible**. Gastos personales/multas/no deducibles → **iva_no_deducible**.

- **Unión Europea (27 países miembros actuales - NO incluye UK, Suiza, Noruega):**
  Verifica si el NIF/VAT del EMISOR tiene prefijo de país UE (AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR/EL, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, SE — excepto ES).
  Si el emisor tiene NIF UE válido:
  - Bienes físicos/mercancías → **adquisiciones_intracomunitarias_bienes**
  - Servicios/Software/SaaS/Licencias → **adquisiciones_intracomunitarias_servicios**
  El NIF del emisor deberá validarse en el ROI (Registro de Operadores Intracomunitarios) y en VIES.
  Si el NIF UE NO está registrado en VIES → **no_registrado_vies**

- **Extracomunitario (fuera UE: UK, Suiza, USA, Colombia, México, China, etc.):** Siempre **importaciones** (salvo ISP explícito con Art.84 LIVA).

**C. Lógica Geográfica para FACTURAS EMITIDAS:**
Identifica el país del receptor. Si el receptor tiene NIF de país UE (no ES), se verifica en VIES y ROI.
Si está registrado → operación intracomunitaria.
Si NO está registrado → **no_registrado_vies**.
Si el emisor está en España y la factura incluye IVA español → **interiores_iva_deducible**.
Si no aplica ninguna regla especial → **no_aplica**.

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
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("account_code, account_description")
    .eq("user_id", userId);

  if (error || !accounts || accounts.length === 0) {
    console.log("No accounts found for user or error:", error);
    return null;
  }

  console.log(`Found ${accounts.length} accounts for matching`);
  
  const descLower = (invoiceDescription || "").toLowerCase();
  let bestMatch: { code: string; score: number } | null = null;
  
  for (const account of accounts) {
    const accountDescLower = account.account_description.toLowerCase();
    const accountWords = accountDescLower.split(/\s+/);
    let matchScore = 0;
    for (const word of accountWords) {
      if (word.length > 3 && descLower.includes(word)) matchScore += 1;
    }
    const invoiceWords = descLower.split(/\s+/);
    for (const word of invoiceWords) {
      if (word.length > 3 && accountDescLower.includes(word)) matchScore += 1;
    }
    if (matchScore > 0 && (!bestMatch || matchScore > bestMatch.score)) {
      bestMatch = { code: account.account_code, score: matchScore };
    }
  }
  
  return bestMatch?.code || null;
}

// Detect if this invoice is a duplicate of an existing classified invoice
async function detectDuplicate(
  supabase: any,
  userId: string,
  invoiceId: string,
  classification: any
): Promise<{ isDuplicate: boolean; originalId?: string; originalFileName?: string }> {
  // Only check duplicates for emitida/recibida invoices with key financial data
  if (!['emitida', 'recibida'].includes(classification.invoice_type)) {
    return { isDuplicate: false };
  }

  const total = classification.total;
  const numeroFactura = classification.numero_factura ? String(classification.numero_factura).trim() : null;
  const idEmisor = classification.id_emisor ? String(classification.id_emisor).trim() : null;
  const fechaFactura = classification.fecha_factura;

  // Invoice number is MANDATORY to detect a duplicate.
  // Without it we cannot reliably distinguish two different invoices from the same issuer.
  if (!numeroFactura) {
    console.log(`DUPLICATE CHECK: Skipping — no invoice number extracted for ${invoiceId}`);
    return { isDuplicate: false };
  }

  // Fetch ALL other invoices from same user that have extracted_data (classified or just saved)
  // NOT filtering by classification_status so we catch invoices classified in this same session
  const { data: existingInvoices, error } = await supabase
    .from("invoices")
    .select("id, file_name, classification_details, invoice_type, classification_status")
    .eq("user_id", userId)
    .neq("id", invoiceId)
    .neq("invoice_type", "duplicada")
    .not("classification_details", "is", null);

  if (error || !existingInvoices || existingInvoices.length === 0) {
    console.log(`DUPLICATE CHECK: No existing invoices found to compare against for invoice ${invoiceId}`);
    return { isDuplicate: false };
  }

  console.log(`DUPLICATE CHECK: Comparing invoice ${invoiceId} (nº ${numeroFactura}, emisor ${idEmisor}, total ${total}, fecha ${fechaFactura}) against ${existingInvoices.length} existing invoices`);

  for (const existing of existingInvoices) {
    const details = existing.classification_details;
    if (!details?.extracted_data) continue;

    const ed = details.extracted_data;
    const edNumero = ed.numero_factura ? String(ed.numero_factura).trim() : null;
    const edEmisor = ed.id_emisor ? String(ed.id_emisor).trim() : null;

    // Invoice number MUST match — without this, we never declare a duplicate.
    // Different invoices from the same issuer share emisor+fecha but have different numbers.
    if (!edNumero || numeroFactura !== edNumero) continue;

    let matchScore = 4; // Invoice number already matched — base score
    if (idEmisor && edEmisor && idEmisor === edEmisor) matchScore += 3;
    if (total && ed.total && Math.abs(Number(total) - Number(ed.total)) < 0.01) matchScore += 2;
    if (fechaFactura && ed.fecha_factura && fechaFactura === ed.fecha_factura) matchScore += 1;

    // Threshold: invoice number match (4) + at least one more strong field (emisor=3 or total=2)
    // Minimum to declare duplicate: same number + same emisor (score=7) OR same number + same total + same date (score=7)
    if (matchScore >= 7) {
      console.log(`DUPLICATE DETECTED: Invoice ${invoiceId} (nº ${numeroFactura}) matches ${existing.id} (score: ${matchScore})`);
      return { isDuplicate: true, originalId: existing.id, originalFileName: existing.file_name };
    } else {
      console.log(`DUPLICATE CHECK: Invoice number matches but other fields differ — NOT a duplicate. Invoice ${invoiceId} vs ${existing.id} (score: ${matchScore})`);
    }
  }

  console.log(`DUPLICATE CHECK: No duplicates found for invoice ${invoiceId}`);
  return { isDuplicate: false };
}

// Robust JSON extractor: handles markdown fences, truncated JSON, trailing commas, control chars
function extractJsonFromResponse(response: string): any {
  // Strip markdown code blocks (```json ... ``` or ``` ... ```)
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find JSON object boundaries
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart === -1) {
    throw new Error("No JSON object found in AI response");
  }

  // If closing brace exists, extract the full object
  if (jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  } else {
    // JSON is truncated - extract what we have from start
    cleaned = cleaned.substring(jsonStart);
  }

  // First attempt: direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_e1) {
    // Fix common issues: trailing commas, control characters
    let fixed = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : '');

    try {
      return JSON.parse(fixed);
    } catch (_e2) {
      // Last resort: repair truncated JSON by closing open braces/brackets
      let depth = 0;
      let inString = false;
      let escape = false;
      for (const ch of fixed) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString) {
          if (ch === '{' || ch === '[') depth++;
          else if (ch === '}' || ch === ']') depth--;
        }
      }
      // Close any open structures
      let repaired = fixed;
      if (inString) repaired += '"';
      while (depth > 0) { repaired += '}'; depth--; }

      try {
        return JSON.parse(repaired);
      } catch (e3) {
        throw new Error(`Cannot parse AI response after repair: ${e3}`);
      }
    }
  }
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
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
            generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 8192 },
          }),
        }
      );

      if (aiResponse.ok) {
        aiData = await aiResponse.json();
        break;
      }

      const status = aiResponse.status;
      const errorText = await aiResponse.text();

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
      classification = extractJsonFromResponse(content);
    } catch (parseErr) {
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
    // Exhaustive list of ALL valid values accepted by the DB constraint
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
      'no_registrado_vies',
      'ticket',
      'otro'
    ];

    // Robust normalization map: catch any creative AI variant and map it to a valid value
    const operationTypeNormalizationMap: Record<string, string> = {
      // Intracomunitaria bienes variants
      'adquisicion_intracomunitaria': 'adquisiciones_intracomunitarias_bienes',
      'adquisicion_intracomunitaria_bienes': 'adquisiciones_intracomunitarias_bienes',
      'adquisiciones_intracomunitaria_bienes': 'adquisiciones_intracomunitarias_bienes',
      'operacion_intracomunitaria_bienes': 'adquisiciones_intracomunitarias_bienes',
      'operaciones_intracomunitarias_bienes': 'adquisiciones_intracomunitarias_bienes',
      'adquisicion_bienes_intracomunitaria': 'adquisiciones_intracomunitarias_bienes',
      // Intracomunitaria servicios variants
      'adquisicion_intracomunitaria_servicios': 'adquisiciones_intracomunitarias_servicios',
      'adquisiciones_intracomunitaria_servicios': 'adquisiciones_intracomunitarias_servicios',
      'operacion_intracomunitaria_servicios': 'adquisiciones_intracomunitarias_servicios',
      'operaciones_intracomunitarias_servicios': 'adquisiciones_intracomunitarias_servicios',
      'prestacion_intracomunitaria_servicios': 'adquisiciones_intracomunitarias_servicios',
      'prestaciones_intracomunitarias_servicios': 'adquisiciones_intracomunitarias_servicios',
      'prestacion_servicios_intracomunitaria': 'adquisiciones_intracomunitarias_servicios',
      'prestaciones_servicios_intracomunitarias': 'adquisiciones_intracomunitarias_servicios',
      'servicios_intracomunitarios': 'adquisiciones_intracomunitarias_servicios',
      'servicio_intracomunitario': 'adquisiciones_intracomunitarias_servicios',
      // Generic intracomunitaria (no bienes/servicios specified) — default to servicios for emitidas, bienes for recibidas handled below
      'operacion_intracomunitaria': 'adquisiciones_intracomunitarias_servicios',
      'operaciones_intracomunitarias': 'adquisiciones_intracomunitarias_bienes',
      'intracomunitaria': 'adquisiciones_intracomunitarias_bienes',
      'intracomunitario': 'adquisiciones_intracomunitarias_bienes',
      // ISP variants
      'inversion_del_sujeto_pasivo': 'inversion_sujeto_pasivo',
      'isp': 'inversion_sujeto_pasivo',
      'reverse_charge': 'inversion_sujeto_pasivo',
      // IVA deducible variants
      'interior_iva_deducible': 'interiores_iva_deducible',
      'interiores_con_iva': 'interiores_iva_deducible',
      'interior_con_iva': 'interiores_iva_deducible',
      'nacional_iva_deducible': 'interiores_iva_deducible',
      'nacional': 'interiores_iva_deducible',
      'interior': 'interiores_iva_deducible',
      // No deducible variants
      'iva_no_deducibles': 'iva_no_deducible',
      'no_deducible': 'iva_no_deducible',
      'gasto_no_deducible': 'iva_no_deducible',
      // Importaciones
      'importacion': 'importaciones',
      'extra_comunitario': 'importaciones',
      'extracomunitario': 'importaciones',
      'extra_comunitaria': 'importaciones',
      // Suplidos
      'suplido': 'suplidos',
      // Kit digital
      'kit_digital_red_es': 'kit_digital',
      // Amazon
      'amazon_eu': 'amazon',
      'amazon_services': 'amazon',
      // No aplica
      'no_aplica_iva': 'no_aplica',
      'exenta': 'no_aplica',
      'exento': 'no_aplica',
      // No registrado VIES
      'no_registrado_en_vies': 'no_registrado_vies',
      'no_registrado_roi': 'no_registrado_vies',
      'sin_registro_vies': 'no_registrado_vies',
      // Compensaciones agrarias
      'compensacion_agraria': 'facturas_compensaciones_agrarias',
      'compensaciones_agrarias': 'facturas_compensaciones_agrarias',
      'regimen_especial_agricultura': 'facturas_compensaciones_agrarias',
    };

    // Force operation_type to "ticket" when invoice_type is "ticket"
    if (classification.invoice_type === 'ticket') {
      classification.operation_type = 'ticket';
    }

    // Normalize the operation_type value
    const rawOperationType = (classification.operation_type || '').toLowerCase().trim();
    if (!validOperationTypes.includes(rawOperationType)) {
      // Try the normalization map
      const normalized = operationTypeNormalizationMap[rawOperationType];
      if (normalized) {
        console.log(`NORMALIZATION: Mapped AI operation_type "${rawOperationType}" → "${normalized}"`);
        classification.operation_type = normalized;
      } else {
        // For generic intracomunitaria based on invoice_type
        if (rawOperationType.includes('intracomunit')) {
          if (classification.invoice_type === 'recibida') {
            // Determine bienes vs servicios from description
            const desc = (classification.descripcion || classification.reasoning || '').toLowerCase();
            const isServices = desc.includes('servic') || desc.includes('software') || desc.includes('licen') || desc.includes('honorar') || desc.includes('asesora') || desc.includes('consulto');
            classification.operation_type = isServices ? 'adquisiciones_intracomunitarias_servicios' : 'adquisiciones_intracomunitarias_bienes';
          } else {
            // emitida - use servicios by default for intracomunitaria
            classification.operation_type = 'adquisiciones_intracomunitarias_servicios';
          }
          console.log(`NORMALIZATION: Generic intracomunitaria "${rawOperationType}" → "${classification.operation_type}"`);
        } else {
          console.log(`NORMALIZATION: Unknown operation_type "${rawOperationType}" → fallback "otro"`);
          classification.operation_type = 'otro';
        }
      }
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

    // GEOGRAPHIC POST-VALIDATION & VIES VALIDATION
    const EU_COUNTRY_CODES = [
      "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
      "DE", "GR", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
      "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
    ];

    const EXTRACOM_KEYWORDS = [
      'colombia', 'méxico', 'mexico', 'usa', 'estados unidos', 'united states',
      'uk', 'reino unido', 'united kingdom', 'gran bretaña', 'england',
      'suiza', 'switzerland', 'noruega', 'norway', 'china', 'japón', 'japan',
      'canadá', 'canada', 'brasil', 'brazil', 'argentina', 'chile', 'perú', 'peru',
      'ecuador', 'venezuela', 'india', 'australia', 'nueva zelanda', 'new zealand',
      'turquía', 'turkey', 'rusia', 'russia', 'marruecos', 'morocco', 'israel',
      'corea', 'korea', 'tailandia', 'thailand', 'singapur', 'singapore',
      'emiratos', 'dubai', 'qatar', 'arabia', 'panamá', 'panama',
      'costa rica', 'guatemala', 'honduras', 'bolivia', 'paraguay', 'uruguay',
      'república dominicana', 'dominican republic', 'cuba', 'puerto rico',
    ];

    // ISP post-validation: only keep inversion_sujeto_pasivo if the legal text is present
    if (classification.operation_type === 'inversion_sujeto_pasivo') {
      const rawLower = (content || '').toLowerCase();
      const reasoningLower = (classification.reasoning || '').toLowerCase();
      const hasLegalText = rawLower.includes('art. 84') || rawLower.includes('art.84') || 
        rawLower.includes('84 (uno') || reasoningLower.includes('art. 84') ||
        rawLower.includes('reverse charge') || rawLower.includes('inversión del sujeto pasivo');
      
      if (!hasLegalText) {
        console.log('ISP POST-VALIDATION: No legal text found. Re-evaluating operation type.');
        // Re-classify based on geography
        const emisorAddr = (classification.direccion_emisor || '').toLowerCase();
        const isExtracom = EXTRACOM_KEYWORDS.some(kw => emisorAddr.includes(kw));
        if (isExtracom && classification.invoice_type === 'recibida') {
          classification.operation_type = 'importaciones';
          classification.reasoning = (classification.reasoning || '') + ' [Corrección ISP: sin texto legal Art.84, reclasificado como importaciones por origen extracomunitario.]';
        } else {
          classification.operation_type = 'otro';
          classification.reasoning = (classification.reasoning || '') + ' [Corrección ISP: sin texto legal explícito Art.84 LIVA, reclasificado como otro.]';
        }
      }
    }

    if (classification.invoice_type === 'recibida') {
      const emisorAddress = (classification.direccion_emisor || '').toLowerCase();
      const emisorReasoning = (classification.reasoning || '').toLowerCase();
      const isExtracom = EXTRACOM_KEYWORDS.some(kw => 
        emisorAddress.includes(kw) || emisorReasoning.includes(kw)
      );
      
      if (isExtracom && classification.operation_type !== 'importaciones' && classification.operation_type !== 'inversion_sujeto_pasivo') {
        console.log(`GEOGRAPHIC FIX: Emisor is extracomunitario. Forcing operation_type to importaciones.`);
        classification.operation_type = 'importaciones';
        classification.reasoning = (classification.reasoning || '') + ` [Corrección geográfica: el emisor es extracomunitario, operación forzada a importaciones.]`;
      }
    }

    // VIES VALIDATION for intracomunitaria operations
    const isIntracomunitaria = [
      'adquisiciones_intracomunitarias_bienes',
      'adquisiciones_intracomunitarias_servicios',
    ].includes(classification.operation_type);

    if (isIntracomunitaria || (classification.invoice_type === 'emitida' || classification.invoice_type === 'recibida')) {
      let nifToValidate: string | null = null;

      if (classification.invoice_type === 'recibida' && isIntracomunitaria) {
        nifToValidate = classification.id_emisor || null;
      } else if (classification.invoice_type === 'emitida') {
        nifToValidate = classification.id_receptor || null;
      }

      if (nifToValidate) {
        const nifClean = nifToValidate.replace(/[\s\-\.]/g, '').toUpperCase();
        let cc = nifClean.substring(0, 2);
        const vatNum = nifClean.substring(2);

        if (cc === 'GR') cc = 'EL';
        const isEuNif = EU_COUNTRY_CODES.includes(cc) && cc !== 'ES';

        if (isEuNif && vatNum.length > 0) {
          try {
            console.log(`VIES validation for ${cc}${vatNum}...`);
            const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${cc}</urn:countryCode>
      <urn:vatNumber>${vatNum}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;

            const viesResp = await fetch(
              "https://ec.europa.eu/taxation_customs/vies/services/checkVatService",
              {
                method: "POST",
                headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "" },
                body: soapEnvelope,
              }
            );

            if (viesResp.ok) {
              const viesText = await viesResp.text();
              const validMatch = viesText.match(/<ns2:valid>(true|false)<\/ns2:valid>/);
              const isValid = validMatch ? validMatch[1] === "true" : false;

              if (!isValid) {
                console.log(`VIES: NIF ${cc}${vatNum} NOT registered. Setting operation to no_registrado_vies.`);
                classification.operation_type = 'no_registrado_vies';
                classification.reasoning = (classification.reasoning || '') + ` [VIES/ROI: NIF ${cc}${vatNum} no registrado en VIES ni en el ROI (Registro de Operadores Intracomunitarios).]`;
              } else {
                console.log(`VIES: NIF ${cc}${vatNum} is registered.`);
                classification.reasoning = (classification.reasoning || '') + ` [VIES/ROI: NIF ${cc}${vatNum} verificado y registrado en VIES y ROI.]`;
              }
            } else {
              console.error("VIES service unavailable:", viesResp.status);
              classification.reasoning = (classification.reasoning || '') + ` [VIES/ROI: Servicio no disponible temporalmente. Verificar manualmente en ROI.]`;
            }
          } catch (viesError) {
            console.error("VIES validation error:", viesError);
            classification.reasoning = (classification.reasoning || '') + ` [VIES/ROI: Error al consultar. Verificar manualmente en ROI.]`;
          }
        }
      }
    }

    // DUPLICATE DETECTION
    const duplicateCheck = await detectDuplicate(supabase, invoice.user_id, invoiceId, classification);
    if (duplicateCheck.isDuplicate) {
      const dupReasoning = `Factura duplicada de "${duplicateCheck.originalFileName}" (ID: ${duplicateCheck.originalId}). ${classification.reasoning || ''}`;
      await supabase
        .from("invoices")
        .update({
          invoice_type: 'duplicada',
          operation_type: classification.operation_type || 'no_aplica',
          classification_status: "classified",
          assigned_account: null,
          classification_details: {
            confidence: classification.confidence,
            raw_response: content,
            reasoning: dupReasoning,
            duplicate_of_id: duplicateCheck.originalId,
            duplicate_of_name: duplicateCheck.originalFileName,
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

      return new Response(
        JSON.stringify({ success: true, classification: { ...classification, invoice_type: 'duplicada' }, duplicate_of: duplicateCheck.originalId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform account reconciliation if user has account book
    let assignedAccount: string | null = null;
    if (hasAccountBook) {
      const description = classification.descripcion || '';
      assignedAccount = await findMatchingAccount(supabase, invoice.user_id, description);
      
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
