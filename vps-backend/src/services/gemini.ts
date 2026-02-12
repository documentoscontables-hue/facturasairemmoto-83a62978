import db from '../db';

const CLASSIFICATION_PROMPT = `Eres un experto en clasificación y extracción de datos de facturas españolas. Analiza el documento y extrae TODA la información posible.

**PASO 1 - DETECCIÓN DEL TIPO DE DOCUMENTO:**
Clasifica el documento en UNA de estas categorías:

1. **Factura Emitida (emitida)**: Factura donde {{CLIENT_NAME}} es el EMISOR (vende/presta servicio)
2. **Factura Recibida (recibida)**: Factura donde {{CLIENT_NAME}} es el RECEPTOR (compra/recibe servicio)
3. **Albarán (albaran)**: Documento de entrega.
4. **Proforma (proforma)**: Factura proforma.
5. **Ticket (ticket)**: Recibo simplificado / ticket de compra (ver reglas detalladas abajo).
6. **No es Factura (no_es_factura)**: Cualquier documento que NO sea una factura, ni un albarán, ni una proforma, ni un ticket.

**REGLAS DE CLASIFICACIÓN DE TIPO (MUY IMPORTANTE):**
- Si el documento dice "Factura" (o equivalente en otro idioma) Y tiene datos fiscales completos → es emitida o recibida
- Si NO dice "Factura" pero es un albarán → invoice_type = "albaran"
- Si NO dice "Factura" pero es una proforma → invoice_type = "proforma"
- Si NO dice "Factura" pero es un ticket/recibo → invoice_type = "ticket"
- Si NO dice "Factura" y NO es albarán, ni proforma, ni ticket → invoice_type = "no_es_factura"

**REGLAS DETALLADAS PARA IDENTIFICAR UN TICKET (MUY IMPORTANTE):**
Clasifica como TICKET únicamente cuando el documento cumpla la MAYORÍA de estas características:
1. **No incluye datos del cliente**: No aparece nombre/razón social, NIF/CIF/DNI ni dirección del cliente.
2. **No presenta elementos fiscales obligatorios de factura completa**: No hay "Número de factura" o "Factura Nº". No hay desglose de IVA (base imponible + tipo + cuota). El IVA suele aparecer como "IVA incluido" (propio de tickets).
3. **Formato típico de ticket**: Documento corto, vertical, similar a recibo. Texto de TPV, cajero o sistema POS. Mensajes típicos: "Gracias por su compra", "Total a pagar", "IVA incluido", "Cajero", "TPV", "Cambio".
4. **Si el documento muestra encabezado formal → NO ES TICKET**: Si dice "Factura", "Invoice", "Factura simplificada", "Factura proforma" → NO es ticket.
5. **Si aparece cualquier dato del cliente → NO es ticket**.

**REGLAS DE DESCARTE PARA TICKETS (evitar confusiones):**
- ❌ NO confundir con FACTURA: Si existe proveedor + cliente + número de factura + IVA desglosado → NO es ticket.
- ❌ NO confundir con PROFORMA: Si contiene "Proforma"/"Factura proforma" + datos del cliente + número de documento → NO es ticket.
- ❌ NO confundir con ALBARÁN: Si contiene "Albarán"/"Delivery note"/"Packing slip" + información de entrega → NO es ticket.
- ❌ NO confundir con NO_ES_FACTURA: Solo clasifica como no_es_factura si no es factura, ni ticket, ni proforma, ni albarán (ej: correos, contratos, presupuestos, pantallazos, movimientos bancarios).

**⭐ REGLA DE ORO PARA TICKETS:** Si no hay datos del cliente → clasificar como TICKET, SALVO que el documento contenga la palabra "Factura", "Proforma" o "Albarán".

**REGLAS DE OPERACIÓN:**
- Si invoice_type es "albaran" → operation_type = "no_aplica"
- Si invoice_type es "proforma" → operation_type = "no_aplica"
- Si invoice_type es "ticket" → operation_type = "ticket"
- Si invoice_type es "no_es_factura" → operation_type = "no_aplica"
- Si invoice_type es "emitida" o "recibida" → clasificar según las categorías de operación

Si es PROFORMA, ALBARÁN o NO ES FACTURA, responde SOLO con:
{
  "invoice_type": "proforma|albaran|no_es_factura",
  "operation_type": "no_aplica",
  "confidence": 0.95,
  "reasoning": "Breve explicación"
}

**SI ES FACTURA (emitida/recibida) O TICKET:**

**CLASIFICACIÓN DEL TIPO (EMITIDA/RECIBIDA):**
- **EMITIDA**: SOLO si {{CLIENT_NAME}} es el EMISOR. El nombre del emisor DEBE coincidir con {{CLIENT_NAME}}.
- **RECIBIDA**: Si {{CLIENT_NAME}} NO es el emisor.

**Operacion** (solo para facturas):
1. **interiores_iva_deducible**: NIF emisor español, IVA desglosado
2. **facturas_compensaciones_agrarias**: Régimen Especial Agrario
3. **adquisiciones_intracomunitarias_bienes**: Emisor UE, BIENES físicos
4. **inversion_sujeto_pasivo**: "Reverse charge" o emisor fuera UE
5. **iva_no_deducible**: Factura no a nombre de la empresa
6. **adquisiciones_intracomunitarias_servicios**: Emisor UE, SERVICIOS
7. **importaciones**: Bienes de fuera UE con DUA
8. **suplidos**: Gastos adelantados
9. **kit_digital**: Subvención Kit Digital
10. **otro**: Solo si no encaja

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
  "reasoning": "Breve explicación"
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

  const systemPrompt = CLASSIFICATION_PROMPT.replace(/\{\{CLIENT_NAME\}\}/g, invoice.client_name) + feedbackPromptSection;

  // Retry with exponential backoff
  const MAX_RETRIES = 5;
  let aiData: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
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
          generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 2048 },
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
    'suplidos', 'kit_digital', 'no_aplica', 'ticket', 'otro'];

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
