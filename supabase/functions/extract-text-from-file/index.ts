import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const VISION_MODEL = "meta-llama/llama-4-maverick:free";

async function callWithRetry(body: object, retries = 2): Promise<Response> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

  for (let i = 0; i <= retries; i++) {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://knowfirst.ai",
        "X-Title": "KnowFirst AI"
      },
      body: JSON.stringify(body)
    });
    if (res.status === 429) {
      if (i === retries) throw new Error("Rate limited. Please wait a moment and try again.");
      await new Promise(r => setTimeout(r, 5000 * (i + 1)));
      continue;
    }
    if (res.status === 503 || res.status === 502) {
      if (i === retries) throw new Error("Service unavailable. Try again shortly.");
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }
    return res;
  }
  throw new Error("All retries failed.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) {
    return new Response(JSON.stringify({
      error: "OPENROUTER_API_KEY secret is missing. Add it to Supabase Edge Function secrets."
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      // Step 1: Convert base64 PDF to Uint8Array and extract raw text
      const pdfBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      const pdfString = new TextDecoder("latin1").decode(pdfBytes);
      const textMatches = pdfString.match(/BT[\s\S]*?ET/g) || [];
      let rawText = "";
      for (const block of textMatches) {
        const strings = block.match(/\(([^)]+)\)/g) || [];
        rawText += strings.map((s: string) => s.slice(1, -1)).join(" ") + " ";
      }
      rawText = rawText.replace(/\\n/g, "\n").replace(/\\\d{3}/g, "").trim();

      // Step 2: Check if meaningful
      const isMeaningful = rawText.replace(/\s/g, "").length > 100
        && (rawText.match(/[a-zA-Z]{3,}/g) || []).length > 20;

      if (isMeaningful) {
        // Step 3: Send to OpenRouter to clean and structure
        const response = await callWithRetry({
          model: TEXT_MODEL,
          messages: [
            {
              role: "system",
              content: "You are a text cleaner. Return only clean readable text, no commentary."
            },
            {
              role: "user",
              content: `Clean this raw PDF text and return all meaningful content as plain text:\n\n${rawText.substring(0, 8000)}`
            }
          ],
          temperature: 0.3,
          max_tokens: 1500
        });

        const data = await response.json();
        extractedText = data?.choices?.[0]?.message?.content ?? "";
        if (!extractedText) throw new Error("Empty response from OpenRouter");
      } else {
        // Step 4: Not meaningful - return error
        return new Response(JSON.stringify({
          error: "unreadable",
          message: "Could not extract text from this PDF. Please upload a PNG or JPG photo of your notes instead."
        }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Images — use vision model
      const response = await callWithRetry({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${fileMimeType};base64,${fileBase64}`
                }
              },
              {
                type: "text",
                text: "Extract ALL text, headings, definitions, formulas, bullet points, and key concepts from this image. Preserve structure. Return as clean plain text only."
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const data = await response.json();
      extractedText = data?.choices?.[0]?.message?.content ?? "";
      if (!extractedText) throw new Error("Empty response from OpenRouter");
    }

    // Step 5: Validate final output
    const finalCheck = extractedText.replace(/\s/g, "").length > 50 && /[a-zA-Z]{3,}/.test(extractedText);
    if (!finalCheck) {
      return new Response(JSON.stringify({
        error: "unreadable",
        message: "Could not read file clearly."
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ extractedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message || "Unknown error", details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
