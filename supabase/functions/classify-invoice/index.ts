import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoiceId } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Invoice not found");
    }

    // Get signed URL for the file
    const { data: signedUrlData } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 60);

    if (!signedUrlData?.signedUrl) {
      throw new Error("Could not get file URL");
    }

    // Download the file to get base64
    const fileResponse = await fetch(signedUrlData.signedUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
    
    const mimeType = invoice.file_type === 'pdf' 
      ? 'application/pdf' 
      : 'image/jpeg';

    // Call AI to classify
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Eres un experto en clasificación de facturas españolas. Analiza la factura y determina:
1. Tipo: "emitida" (factura que emite la empresa) o "recibida" (factura que recibe la empresa de un proveedor)
2. Tipo de operación según estas categorías:
   - adquisiciones_intracomunitarias: operaciones con países UE
   - intereses_iva_deducible: facturas con intereses donde el IVA es deducible
   - gastos_generales: gastos operativos generales
   - servicios_profesionales: honorarios profesionales, consultoría
   - suministros: electricidad, agua, gas, teléfono
   - alquileres: arrendamientos de locales, equipos
   - inversiones: compra de activos fijos, maquinaria
   - otros: cuando no encaje en ninguna categoría

Responde SOLO con JSON válido sin markdown: {"invoice_type": "emitida|recibida", "operation_type": "categoria", "confidence": 0.0-1.0, "vendor": "nombre", "amount": numero, "date": "YYYY-MM-DD", "invoice_number": "numero"}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Clasifica esta factura:"
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error("AI classification failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the response
    let classification;
    try {
      // Remove potential markdown code blocks
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      classification = JSON.parse(cleanContent);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    // Update invoice with classification
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        invoice_type: classification.invoice_type,
        operation_type: classification.operation_type,
        classification_status: "classified",
        classification_details: {
          confidence: classification.confidence,
          raw_response: content,
          extracted_data: {
            vendor: classification.vendor,
            amount: classification.amount,
            date: classification.date,
            invoice_number: classification.invoice_number,
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
