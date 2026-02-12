import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// EU country codes (27 member states)
const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

interface ViesResult {
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  name?: string;
  address?: string;
  requestDate?: string;
  error?: string;
}

async function checkVatVies(countryCode: string, vatNumber: string): Promise<ViesResult> {
  const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${countryCode}</urn:countryCode>
      <urn:vatNumber>${vatNumber}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;

  const response = await fetch(
    "https://ec.europa.eu/taxation_customs/vies/services/checkVatService",
    {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: "",
      },
      body: soapEnvelope,
    }
  );

  const text = await response.text();

  if (!response.ok) {
    console.error("VIES SOAP error:", text);
    return {
      valid: false,
      countryCode,
      vatNumber,
      error: `VIES service error (${response.status})`,
    };
  }

  // Parse SOAP response
  const validMatch = text.match(/<ns2:valid>(true|false)<\/ns2:valid>/);
  const nameMatch = text.match(/<ns2:name>([^<]*)<\/ns2:name>/);
  const addressMatch = text.match(/<ns2:address>([^<]*)<\/ns2:address>/);
  const dateMatch = text.match(/<ns2:requestDate>([^<]*)<\/ns2:requestDate>/);

  const isValid = validMatch ? validMatch[1] === "true" : false;

  return {
    valid: isValid,
    countryCode,
    vatNumber,
    name: nameMatch?.[1] || undefined,
    address: addressMatch?.[1] || undefined,
    requestDate: dateMatch?.[1] || undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { countryCode, vatNumber } = await req.json();

    if (!countryCode || !vatNumber) {
      return new Response(
        JSON.stringify({ error: "countryCode and vatNumber are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cc = countryCode.toUpperCase().trim();
    // Greece uses EL in VIES
    const normalizedCC = cc === "GR" ? "EL" : cc;

    if (!EU_COUNTRY_CODES.includes(normalizedCC) && !EU_COUNTRY_CODES.includes(cc)) {
      return new Response(
        JSON.stringify({
          valid: false,
          countryCode: cc,
          vatNumber,
          error: `${cc} no es un país miembro de la UE. Solo se pueden validar NIF de países de la UE.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean VAT number (remove spaces, dashes)
    const cleanVat = vatNumber.replace(/[\s\-\.]/g, "");

    const result = await checkVatVies(normalizedCC, cleanVat);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("VIES validation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
