import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

async function callGeminiWithRetry(url: string, body: object, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status === 503) {
      const wait = Math.pow(2, i) * 2000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error("Gemini rate limited after retries. Please wait a moment and try again.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileMimeType } = await req.json();

    if (!fileBase64 || !fileMimeType) {
      return new Response(JSON.stringify({ error: "Missing fileBase64 or fileMimeType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gemini 2.0 Flash handles PDF, PNG, JPG, WEBP natively via inline_data
    const apiUrl = `${GEMINI_URL}?key=${Deno.env.get("GEMINI_API_KEY")}`;
    const response = await callGeminiWithRetry(apiUrl, {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: fileMimeType,
              data: fileBase64,
            },
          },
          {
            text: "Extract ALL text, headings, definitions, formulas, bullet points, and key concepts from this document. Preserve the structure and order. Return as clean plain text only.",
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4000,
      },
    });

    if (!response) throw new Error("No response from Gemini");

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gemini file error: ${response.status}`, errData);
      throw new Error(`Gemini file error ${response.status}: ${JSON.stringify(errData)}`);
    }

    const data = await response.json();
    const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!extractedText || extractedText.replace(/\s/g, "").length < 50) {
      return new Response(JSON.stringify({
        error: "unreadable",
        message: "Could not extract text from this file. Try uploading a clearer image (PNG or JPG) of your notes.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ extractedText }), {
      status: 200,
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
