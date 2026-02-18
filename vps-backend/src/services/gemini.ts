import db from '../db';

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

**REGLAS DE CONTROL:**
- Países UE: Solo 27 miembros actuales. UK, Suiza, Noruega son Extracomunitarios.
- Idioma: Razonamiento 100% en español.
- Contexto: Cliente siempre de España o Islas Canarias.

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
  "nombre_emisor": "Empresa S.L.",
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
  "logo_detected": "Nombre empresa del logo",
  "reasoning": "Breve explicación en español"
}`;

async function findMatchingAccount(userId: string, description: string): Promise<string | null> {
  const result = await db.query(
    'SELECT account_code, account_description FROM accounts WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) return null;

  const descLower = (description || '').toLowerCase();
  let bestMatch: { code: string; score: number } | null = null;

  for (const account of result.rows) {
    const accountDescLower = account.account_description.toLowerCase();
    const accountWords = accountDescLower.split(/\s+/);
    let matchScore = 0;

    for (const word of accountWords) {
      if (word.length > 3 && descLower.includes(word)) matchScore++;
    }
    const invoiceWords = descLower.split(/\s+/);
    for (const word of invoiceWords) {
      if (word.length > 3 && accountDescLower.includes(word)) matchScore++;
    }

    if (matchScore > 0 && (!bestMatch || matchScore > bestMatch.score)) {
      bestMatch = { code: account.account_code, score: matchScore };
    }
  }

  return bestMatch?.code || null;
}

export async function classifyInvoice(
  invoice: any,
  base64Data: string,
  mimeType: string,
  feedbackPromptSection: string,
  hasAccountBook: boolean,
  userId: string
) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error('GEMINI_API_KEY no configurada');

  const systemPrompt = CLASSIFICATION_PROMPT
    .replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name)
    .replace(/\{\{CLIENT_NIT\}\}/g, invoice.client_nit || 'No proporcionado')
    + feedbackPromptSection;

  // Retry with exponential backoff
  const MAX_RETRIES = 5;
  let aiData: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemPrompt },
              { text: 'Analiza esta factura. PRIMERO verifica si es una PROFORMA o un ALBARÁN. Si no lo es, extrae toda la información:' },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }],
          generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 4096 },
        }),
      }
    );

    if (aiResponse.ok) {
      aiData = await aiResponse.json();
      break;
    }

    const status = aiResponse.status;
    if ((status === 429 || status === 503) && attempt < MAX_RETRIES) {
      const waitMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 60000);
      console.log(`Gemini ${status}, retry in ${Math.round(waitMs)}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    throw new Error(`AI classification failed (status ${status})`);
  }

  if (!aiData) throw new Error('AI classification failed after retries');

  const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('No response from AI');

  const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
  const classification = JSON.parse(cleanContent);

  // Handle proforma/albaran/no_es_factura
  if (['proforma', 'albaran', 'no_es_factura'].includes(classification.invoice_type)) {
    await db.query(
      `UPDATE invoices SET invoice_type = $1, operation_type = 'no_aplica', classification_status = 'classified',
       assigned_account = NULL, classification_details = $2 WHERE id = $3`,
      [
        classification.invoice_type,
        JSON.stringify({ confidence: classification.confidence || 0.95, raw_response: content, reasoning: classification.reasoning }),
        invoice.id,
      ]
    );
    return { success: true, classification };
  }

  // Validate operation type
  const validOps = ['interiores_iva_deducible', 'facturas_compensaciones_agrarias', 'adquisiciones_intracomunitarias_bienes',
    'inversion_sujeto_pasivo', 'iva_no_deducible', 'adquisiciones_intracomunitarias_servicios', 'importaciones',
    'suplidos', 'kit_digital', 'amazon', 'no_aplica', 'ticket', 'otro'];

  if (classification.invoice_type === 'ticket') classification.operation_type = 'ticket';
  if (!validOps.includes(classification.operation_type)) classification.operation_type = 'otro';

  // Post-classification validation for emitida/recibida
  if (classification.invoice_type === 'emitida' || classification.invoice_type === 'recibida') {
    const clientLower = (invoice.client_name || '').toLowerCase().trim();
    const emisorLower = (classification.nombre_emisor || '').toLowerCase().trim();
    const receptorLower = (classification.nombre_receptor || '').toLowerCase().trim();

    const matchesEmisor = emisorLower.includes(clientLower) || clientLower.includes(emisorLower);
    const matchesReceptor = receptorLower.includes(clientLower) || clientLower.includes(receptorLower);

    if (classification.invoice_type === 'emitida' && !matchesEmisor && matchesReceptor) {
      classification.invoice_type = 'recibida';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección automática: cliente coincide con receptor.]';
    } else if (classification.invoice_type === 'recibida' && !matchesReceptor && matchesEmisor) {
      classification.invoice_type = 'emitida';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección automática: cliente coincide con emisor.]';
    } else if (!matchesEmisor && !matchesReceptor) {
      classification.invoice_type = 'recibida';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección automática: cliente no coincide con emisor, se asume recibida.]';
    }
  }

  // ISP POST-VALIDATION: only keep if legal text Art.84 is present
  if (classification.operation_type === 'inversion_sujeto_pasivo') {
    const rawLower = (content || '').toLowerCase();
    const reasoningLower = (classification.reasoning || '').toLowerCase();
    const hasLegalText = rawLower.includes('art. 84') || rawLower.includes('art.84') ||
      rawLower.includes('84 (uno') || reasoningLower.includes('art. 84') ||
      rawLower.includes('reverse charge') || rawLower.includes('inversión del sujeto pasivo');

    if (!hasLegalText) {
      const emisorAddr = (classification.direccion_emisor || '').toLowerCase();
      const EXTRACOM_CHECK = ['colombia','méxico','mexico','usa','estados unidos','united states','uk','reino unido','united kingdom','suiza','switzerland','noruega','norway','china','japón','japan','canadá','canada','brasil','brazil','argentina','chile','perú','peru'];
      const isExtracom = EXTRACOM_CHECK.some(kw => emisorAddr.includes(kw));
      if (isExtracom && classification.invoice_type === 'recibida') {
        classification.operation_type = 'importaciones';
        classification.reasoning = (classification.reasoning || '') + ' [Corrección ISP: sin texto legal Art.84, reclasificado como importaciones.]';
      } else {
        classification.operation_type = 'otro';
        classification.reasoning = (classification.reasoning || '') + ' [Corrección ISP: sin texto legal explícito Art.84 LIVA, reclasificado como otro.]';
      }
    }
  }

  // EXTRACOMUNITARIO POST-VALIDATION
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

  if (classification.invoice_type === 'recibida') {
    const emisorAddr = (classification.direccion_emisor || '').toLowerCase();
    const reasoning = (classification.reasoning || '').toLowerCase();
    const isExtracom = EXTRACOM_KEYWORDS.some(kw => emisorAddr.includes(kw) || reasoning.includes(kw));

    if (isExtracom && classification.operation_type !== 'importaciones' && classification.operation_type !== 'inversion_sujeto_pasivo') {
      classification.operation_type = 'importaciones';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección geográfica: emisor extracomunitario, operación forzada a importaciones.]';
    }
  }

  // DUPLICATE DETECTION
  if (['emitida', 'recibida'].includes(classification.invoice_type)) {
    const existingResult = await db.query(
      `SELECT id, file_name, classification_details FROM invoices 
       WHERE user_id = $1 AND classification_status = 'classified' AND id != $2 AND invoice_type != 'duplicada'`,
      [invoice.user_id, invoice.id]
    );

    for (const existing of existingResult.rows) {
      const details = existing.classification_details;
      const ed = details?.extracted_data;
      if (!ed) continue;

      let matchScore = 0;
      if (classification.numero_factura && ed.numero_factura && classification.numero_factura === ed.numero_factura) matchScore += 3;
      if (classification.id_emisor && ed.id_emisor && classification.id_emisor === ed.id_emisor) matchScore += 2;
      if (classification.total && ed.total && Math.abs(Number(classification.total) - Number(ed.total)) < 0.01) matchScore += 2;
      if (classification.fecha_factura && ed.fecha_factura && classification.fecha_factura === ed.fecha_factura) matchScore += 2;

      if (matchScore >= 5) {
        const dupReasoning = `Factura duplicada de "${existing.file_name}" (ID: ${existing.id}). ${classification.reasoning || ''}`;
        await db.query(
          `UPDATE invoices SET invoice_type = 'duplicada', operation_type = $1, classification_status = 'classified',
           assigned_account = NULL, classification_details = $2 WHERE id = $3`,
          [
            classification.operation_type || 'no_aplica',
            JSON.stringify({
              confidence: classification.confidence,
              raw_response: content,
              reasoning: dupReasoning,
              duplicate_of_id: existing.id,
              duplicate_of_name: existing.file_name,
              extracted_data: {
                idioma: classification.idioma, moneda: classification.moneda,
                fecha_factura: classification.fecha_factura, numero_factura: classification.numero_factura,
                subtotal: classification.subtotal, impuestos: classification.impuestos,
                porcentaje_iva: classification.porcentaje_iva, total: classification.total,
                nombre_emisor: classification.nombre_emisor, id_emisor: classification.id_emisor,
                direccion_emisor: classification.direccion_emisor, codigo_postal_emisor: classification.codigo_postal_emisor,
                nombre_receptor: classification.nombre_receptor, id_receptor: classification.id_receptor,
                direccion_receptor: classification.direccion_receptor, codigo_postal_receptor: classification.codigo_postal_receptor,
                descripcion: classification.descripcion, factura_exenta: classification.factura_exenta,
                motivo_exencion: classification.motivo_exencion,
              },
            }),
            invoice.id,
          ]
        );
        return { success: true, classification: { ...classification, invoice_type: 'duplicada' }, duplicate_of: existing.id };
      }
    }
  }

  // Account reconciliation
  let assignedAccount: string | null = null;
  if (hasAccountBook) {
    assignedAccount = await findMatchingAccount(userId, classification.descripcion || '');
    if (!assignedAccount) assignedAccount = 'NO ENCONTRADO';
  }

  await db.query(
    `UPDATE invoices SET invoice_type = $1, operation_type = $2, classification_status = 'classified',
     assigned_account = $3, classification_details = $4 WHERE id = $5`,
    [
      classification.invoice_type,
      classification.operation_type,
      assignedAccount,
      JSON.stringify({
        confidence: classification.confidence,
        raw_response: content,
        reasoning: classification.reasoning,
        logo_detected: classification.logo_detected,
        extracted_data: {
          idioma: classification.idioma, moneda: classification.moneda,
          fecha_factura: classification.fecha_factura, numero_factura: classification.numero_factura,
          subtotal: classification.subtotal, impuestos: classification.impuestos,
          porcentaje_iva: classification.porcentaje_iva, total: classification.total,
          nombre_emisor: classification.nombre_emisor, id_emisor: classification.id_emisor,
          direccion_emisor: classification.direccion_emisor, codigo_postal_emisor: classification.codigo_postal_emisor,
          nombre_receptor: classification.nombre_receptor, id_receptor: classification.id_receptor,
          direccion_receptor: classification.direccion_receptor, codigo_postal_receptor: classification.codigo_postal_receptor,
          descripcion: classification.descripcion, factura_exenta: classification.factura_exenta,
          motivo_exencion: classification.motivo_exencion,
        },
      }),
      invoice.id,
    ]
  );

  return { success: true, classification, assigned_account: assignedAccount };
}
