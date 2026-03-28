import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`;

async function callGeminiWithRetry(
  body: object,
  retries = 2
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      if (i === retries) throw new Error("Rate limited after retries. Please wait 1 minute.");
      const wait = 15000 * (i + 1);
      console.log(`429 rate limited. Waiting ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.status === 503) {
      if (i === retries) throw new Error("Gemini unavailable.");
      await new Promise(r => setTimeout(r, 8000));
      continue;
    }
    return res;
  }
  throw new Error("All retries failed.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileMimeType } = await req.json();

    if (!fileBase64 || !fileMimeType) {
      return new Response(JSON.stringify({ error: "Missing fileBase64 or fileMimeType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extractedText = "";

    if (fileMimeType === "application/pdf") {
      // For PDFs: decode base64, use a text-based extraction
      const binaryStr = atob(fileBase64);
      // Simple PDF text extraction: find text between parentheses in PDF stream
      const textChunks: string[] = [];
      const regex = /\(([^)]+)\)/g;
      let match;
      while ((match = regex.exec(binaryStr)) !== null) {
        const chunk = match[1];
        if (chunk.length > 1 && /[a-zA-Z]/.test(chunk)) {
          textChunks.push(chunk);
        }
      }
      const rawPdfText = textChunks.join(" ").substring(0, 8000);

      if (rawPdfText.trim().length < 20) {
        // Fallback: tell user we couldn't extract much
        extractedText = "PDF text extraction yielded minimal content. The quiz will rely on the concept name.";
      } else {
        const response = await callGeminiWithRetry({
          contents: [
            {
              parts: [
                {
                  text: `You extract and summarize key concepts from text. Extract all key concepts, definitions, and important points from this text. Return as organized plain text:\n\n${rawPdfText}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        });

        if (!response.ok) {
          throw new Error(`Gemini API returned ${response.status}`);
        }

        const data = await response.json();
        extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      }
    } else {
      // For images: use vision model
      const response = await callGeminiWithRetry({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: fileMimeType,
                  data: fileBase64,
                },
              },
              {
                text: "Extract all text, key concepts, definitions, and important points from this image. Return as plain text.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      });

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini vision error: ${response.status} - ${errBody}`);
        throw new Error(`Gemini API returned ${response.status}`);
      }

      const data = await response.json();
      extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    }

    return new Response(JSON.stringify({ extractedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
