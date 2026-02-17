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
- "Albarán" / "Delivery Note" / "Packing Slip" → invoice_type = "albaran", operation_type = "no_aplica"
- "Proforma" / "Factura Proforma" / "Pro forma Invoice" → invoice_type = "proforma", operation_type = "no_aplica"

**PASO 3 - Filtro de Documentos No-Factura:**
Si no es ticket, ni albarán, ni proforma, ANTES de verificar si dice "Factura", comprueba si el documento es realmente uno de estos tipos de documento que NO son facturas (aunque puedan contener la palabra "factura" en campos como "dirección de facturación", "facturar a", etc.):
- **Pedido** / "Orden de compra" / "Purchase Order" / "Order" / "Orden" / "Confirmación de pedido" / "Order Confirmation" / "Bestellung"
- **Presupuesto** / "Quotation" / "Quote" / "Estimate" / "Angebot" / "Devis"
- **Nota de crédito** / "Credit Note" / "Abono" / "Gutschrift" / "Avoir"
- **Nota de débito** / "Debit Note" / "Lastschrift"
- **Recibo** / "Receipt" / "Quittung" / "Reçu" (sin estructura fiscal de factura)
- **Contrato** / "Contract" / "Agreement" / "Vertrag"
- **Certificado** / "Certificate"
- **Extracto** / "Statement" / "Kontoauszug"
- **Remesa** / "Remittance"
- **Justificante de pago** / "Payment confirmation" / "Proof of payment"
- **Carta** / "Letter" / "Comunicación"

Si el título principal o encabezado del documento coincide con alguno de estos tipos → invoice_type = "no_es_factura", operation_type = "no_aplica". La palabra "factura" en campos secundarios (dirección de facturación, datos de facturación, etc.) NO convierte al documento en factura.

**PASO 4 - Validación de Factura:**
Si no fue filtrado en los pasos anteriores:
- Si NO aparece el término "Factura" (o equivalente: "Invoice", "Facture", "Rechnung", "Fattura") como TÍTULO o ENCABEZADO PRINCIPAL del documento → invoice_type = "no_es_factura", operation_type = "no_aplica"
- Si SÍ aparece como título principal: Clasificar como Factura Emitida o Factura Recibida según el rol del cliente.

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
- **Unión Europea (27 países miembros actuales):** Se verificará el NIF del emisor en VIES automáticamente. Si está registrado: Bienes físicos/logística → **adquisiciones_intracomunitarias_bienes**. Software/SaaS/Servicios → **adquisiciones_intracomunitarias_servicios**. Si NO está registrado en VIES → **no_registrado_vies**.
- **Extracomunitario (fuera UE: UK, Suiza, USA, Colombia, México, etc.):** Clasificar siempre como **importaciones** (salvo que mencione ISP explícitamente).

**C. Lógica Geográfica para FACTURAS EMITIDAS:**
Identifica el país del receptor. Si el receptor es de la UE, se verificará su NIF en VIES. Si está registrado → operación intracomunitaria con VIES verificado. Si NO está registrado → **no_registrado_vies**.
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

async function validateVIES(nif: string): Promise<{ valid: boolean; error?: string }> {
  const nifClean = nif.replace(/[\s\-\.]/g, '').toUpperCase();
  let cc = nifClean.substring(0, 2);
  const vatNum = nifClean.substring(2);

  if (cc === 'GR') cc = 'EL';
  const isEuNif = EU_COUNTRY_CODES.includes(cc) && cc !== 'ES';

  if (!isEuNif || vatNum.length === 0) {
    return { valid: true }; // Not applicable, skip
  }

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
      'https://ec.europa.eu/taxation_customs/vies/services/checkVatService',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '' },
        body: soapEnvelope,
      }
    );

    if (viesResp.ok) {
      const viesText = await viesResp.text();
      const validMatch = viesText.match(/<ns2:valid>(true|false)<\/ns2:valid>/);
      const isValid = validMatch ? validMatch[1] === 'true' : false;
      return { valid: isValid };
    } else {
      console.error('VIES service unavailable:', viesResp.status);
      return { valid: true, error: 'Servicio no disponible temporalmente' };
    }
  } catch (viesError) {
    console.error('VIES validation error:', viesError);
    return { valid: true, error: 'Error al consultar el servicio' };
  }
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

  const clientNit = invoice.client_nit || '';

  const systemPrompt = CLASSIFICATION_PROMPT
    .replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name)
    .replace(/\{\{CLIENT_NIT\}\}/g, clientNit || 'No proporcionado')
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
              { text: 'Analiza esta factura. PRIMERO verifica si es una PROFORMA o un ALBARÁN. Si no lo es, extrae toda la información. Presta especial atención al LOGO para identificar al emisor:' },
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

  console.log('AI Response:', content);

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
  const validOps = [
    'interiores_iva_deducible', 'facturas_compensaciones_agrarias',
    'adquisiciones_intracomunitarias_bienes', 'inversion_sujeto_pasivo',
    'iva_no_deducible', 'adquisiciones_intracomunitarias_servicios',
    'importaciones', 'suplidos', 'kit_digital', 'amazon',
    'no_aplica', 'no_registrado_vies', 'ticket', 'otro',
  ];

  if (classification.invoice_type === 'ticket') classification.operation_type = 'ticket';
  if (!validOps.includes(classification.operation_type)) classification.operation_type = 'otro';

  // Post-classification validation for emitida/recibida (with NIT matching)
  if (classification.invoice_type === 'emitida' || classification.invoice_type === 'recibida') {
    const clientLower = (invoice.client_name || '').toLowerCase().trim();
    const clientNitLower = (clientNit || '').toLowerCase().trim();
    const emisorLower = (classification.nombre_emisor || '').toLowerCase().trim();
    const receptorLower = (classification.nombre_receptor || '').toLowerCase().trim();
    const idEmisorLower = (classification.id_emisor || '').toLowerCase().trim();
    const idReceptorLower = (classification.id_receptor || '').toLowerCase().trim();

    const matchesEmisor = (emisorLower.includes(clientLower) || clientLower.includes(emisorLower))
      || (clientNitLower && (idEmisorLower === clientNitLower));
    const matchesReceptor = (receptorLower.includes(clientLower) || clientLower.includes(receptorLower))
      || (clientNitLower && (idReceptorLower === clientNitLower));

    if (classification.invoice_type === 'emitida' && !matchesEmisor && matchesReceptor) {
      console.log('POST-VALIDATION FIX: Changed from emitida to recibida.');
      classification.invoice_type = 'recibida';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección automática: el cliente coincide con el receptor, no con el emisor.]';
    } else if (classification.invoice_type === 'recibida' && !matchesReceptor && matchesEmisor) {
      console.log('POST-VALIDATION FIX: Changed from recibida to emitida.');
      classification.invoice_type = 'emitida';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección automática: el cliente coincide con el emisor.]';
    } else if (!matchesEmisor && !matchesReceptor) {
      console.log('POST-VALIDATION: Client doesn\'t match either. Defaulting to recibida.');
      classification.invoice_type = 'recibida';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección automática: el cliente no coincide con el emisor, se asume recibida.]';
    }
  }

  // EXTRACOMUNITARIO POST-VALIDATION
  if (classification.invoice_type === 'recibida') {
    const emisorAddr = (classification.direccion_emisor || '').toLowerCase();
    const reasoning = (classification.reasoning || '').toLowerCase();
    const isExtracom = EXTRACOM_KEYWORDS.some(kw => emisorAddr.includes(kw) || reasoning.includes(kw));

    if (isExtracom && classification.operation_type !== 'importaciones' && classification.operation_type !== 'inversion_sujeto_pasivo') {
      console.log('GEOGRAPHIC FIX: Emisor is extracomunitario. Forcing operation_type to importaciones.');
      classification.operation_type = 'importaciones';
      classification.reasoning = (classification.reasoning || '') + ' [Corrección geográfica: el emisor es extracomunitario, operación forzada a importaciones.]';
    }
  }

  // VIES VALIDATION
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
      const viesResult = await validateVIES(nifToValidate);

      if (viesResult.error) {
        classification.reasoning = (classification.reasoning || '') + ` [VIES: ${viesResult.error}.]`;
      } else if (!viesResult.valid) {
        const nifClean = nifToValidate.replace(/[\s\-\.]/g, '').toUpperCase();
        console.log(`VIES: NIF ${nifClean} NOT registered. Setting operation to no_registrado_vies.`);
        classification.operation_type = 'no_registrado_vies';
        classification.reasoning = (classification.reasoning || '') + ` [VIES: NIF ${nifClean} no registrado en VIES.]`;
      } else {
        const nifClean = nifToValidate.replace(/[\s\-\.]/g, '').toUpperCase();
        console.log(`VIES: NIF ${nifClean} is registered.`);
        classification.reasoning = (classification.reasoning || '') + ` [VIES: NIF ${nifClean} verificado y registrado en VIES.]`;
      }
    }
  }

  // Account reconciliation
  let assignedAccount: string | null = null;
  if (hasAccountBook) {
    assignedAccount = await findMatchingAccount(userId, classification.descripcion || '');
    if (!assignedAccount) {
      assignedAccount = 'NO ENCONTRADO';
      console.log('No matching account found, assigning: NO ENCONTRADO');
    } else {
      console.log('Matched account:', assignedAccount);
    }
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
