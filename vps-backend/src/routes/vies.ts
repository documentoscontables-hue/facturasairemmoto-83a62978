import { Router, Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';

const router = Router();

// POST /api/vies/validate
router.post('/validate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { countryCode, vatNumber } = req.body;
    if (!countryCode || !vatNumber) {
      return res.status(400).json({ error: 'countryCode y vatNumber son requeridos' });
    }

    const cc = countryCode === 'GR' ? 'EL' : countryCode.toUpperCase();
    const vatNum = vatNumber.replace(/[\s\-\.]/g, '');

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

    if (!viesResp.ok) {
      return res.json({ valid: false, error: 'Servicio VIES no disponible temporalmente' });
    }

    const viesText = await viesResp.text();
    const validMatch = viesText.match(/<ns2:valid>(true|false)<\/ns2:valid>/);
    const nameMatch = viesText.match(/<ns2:name>([^<]*)<\/ns2:name>/);
    const addressMatch = viesText.match(/<ns2:address>([^<]*)<\/ns2:address>/);

    return res.json({
      valid: validMatch ? validMatch[1] === 'true' : false,
      name: nameMatch?.[1] || null,
      address: addressMatch?.[1] || null,
    });
  } catch (error: any) {
    console.error('VIES validation error:', error.message);
    return res.json({ valid: false, error: 'Error al consultar VIES' });
  }
});

export default router;
