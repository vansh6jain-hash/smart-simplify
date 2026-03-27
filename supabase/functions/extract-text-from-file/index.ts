import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function callGroqWithRetry(body: unknown, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && i < retries - 1) {
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
      continue;
    }
    return res;
  }
  throw new Error("All retries exhausted");
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

    let extractedText = "";

    if (fileMimeType === "application/pdf") {
      // For PDFs: decode base64, use a text-based GROQ call to summarize
      // Since we can't use pdfjs-dist in Deno easily, we'll decode and extract what we can
      // We'll send the raw text extraction request to GROQ
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
        const response = await callGroqWithRetry({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You extract and summarize key concepts from text." },
            { role: "user", content: `Extract all key concepts, definitions, and important points from this text. Return as organized plain text:\n\n${rawPdfText}` },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        });

        if (!response.ok) {
          throw new Error(`GROQ API returned ${response.status}`);
        }

        const data = await response.json();
        extractedText = data?.choices?.[0]?.message?.content?.trim() ?? "";
      }
    } else {
      // For images: use vision model
      const response = await callGroqWithRetry({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${fileMimeType};base64,${fileBase64}` } },
              { type: "text", text: "Extract all text, key concepts, definitions, and important points from this image. Return as plain text." },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!response.ok) {
        const errBody = await response.text();
        console.error(`GROQ vision error: ${response.status} - ${errBody}`);
        throw new Error(`GROQ API returned ${response.status}`);
      }

      const data = await response.json();
      extractedText = data?.choices?.[0]?.message?.content?.trim() ?? "";
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
