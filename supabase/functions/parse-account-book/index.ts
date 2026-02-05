import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PARSE_BOOK_PROMPT = `Eres un experto en contabilidad española. Tu tarea es extraer las cuentas contables de este libro/plan de cuentas.

El documento puede contener un listado de cuentas contables con su código y descripción.

**ESTRUCTURA ESPERADA:**
- Código de cuenta: Número que identifica la cuenta (ej: 100, 400, 6000, 62900)
- Descripción: Nombre o descripción de la cuenta

**EJEMPLOS DE CUENTAS:**
- 100 - Capital social
- 400 - Proveedores
- 430 - Clientes
- 572 - Bancos e instituciones de crédito
- 600 - Compras de mercaderías
- 700 - Ventas de mercaderías

**INSTRUCCIONES:**
1. Busca todas las filas/líneas que contengan un código numérico y una descripción
2. Ignora encabezados, totales, y líneas vacías
3. Extrae SOLO cuentas válidas con código y descripción
4. El código puede estar en cualquier columna, busca patrones numéricos que parezcan códigos contables

Responde SOLO con JSON válido sin markdown:
{
  "accounts": [
    { "code": "100", "description": "Capital social" },
    { "code": "400", "description": "Proveedores" }
  ],
  "total_found": 2
}`;

function parseExcelToText(buffer: ArrayBuffer): string {
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    let fullText = "";
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      // Convert to CSV for easy text extraction
      const csv = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
      fullText += `=== Hoja: ${sheetName} ===\n${csv}\n\n`;
    }
    
    return fullText;
  } catch (error) {
    console.error("Error parsing Excel:", error);
    throw new Error("Failed to parse Excel file");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the book record
    const { data: book, error: bookError } = await supabase
      .from("account_books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
      throw new Error("Book not found");
    }

    console.log("Processing book:", book.file_name);

    // Get signed URL for the file
    const { data: signedUrlData } = await supabase.storage
      .from("account-books")
      .createSignedUrl(book.file_path, 60);

    if (!signedUrlData?.signedUrl) {
      throw new Error("Could not get file URL");
    }

    const fileResponse = await fetch(signedUrlData.signedUrl);
    const fileBuffer = await fileResponse.arrayBuffer();
    
    // Determine file type and prepare content for AI
    const fileExt = book.file_name.split('.').pop()?.toLowerCase();
    const isExcel = ['xlsx', 'xls'].includes(fileExt || '');
    const isPdf = fileExt === 'pdf';
    
    let aiRequestBody;
    
    if (isExcel) {
      // Parse Excel to text first
      console.log("Parsing Excel file to text...");
      const excelText = parseExcelToText(fileBuffer);
      console.log("Excel parsed, text length:", excelText.length);
      
      // Send as text to Gemini
      aiRequestBody = {
        contents: [
          {
            parts: [
              { text: PARSE_BOOK_PROMPT },
              { text: `Contenido del archivo Excel:\n\n${excelText}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      };
    } else if (isPdf) {
      // Convert PDF to base64 and send directly
      const uint8Array = new Uint8Array(fileBuffer);
      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Data = btoa(binaryString);
      
      aiRequestBody = {
        contents: [
          {
            parts: [
              { text: PARSE_BOOK_PROMPT },
              { text: "Extrae todas las cuentas contables de este documento:" },
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      };
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }

    console.log("Sending request to Gemini for book parsing...");

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiRequestBody),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error("AI parsing failed");
    }

    const aiData = await aiResponse.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI Response received, parsing accounts...");

    let parsedResult;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    const accounts = parsedResult.accounts || [];
    console.log(`Found ${accounts.length} accounts`);

    // Delete existing accounts for this book
    await supabase
      .from("accounts")
      .delete()
      .eq("book_id", bookId);

    // Insert new accounts
    if (accounts.length > 0) {
      const accountsToInsert = accounts.map((acc: { code: string; description: string }) => ({
        book_id: bookId,
        user_id: book.user_id,
        account_code: acc.code,
        account_description: acc.description,
      }));

      const { error: insertError } = await supabase
        .from("accounts")
        .insert(accountsToInsert);

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        accounts_count: accounts.length,
        accounts: accounts.slice(0, 10) // Return first 10 for preview
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Book parsing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
