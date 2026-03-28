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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY secret is missing." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { studyMaterial, concept } = await req.json();
    if (!studyMaterial?.trim()) {
      return new Response(JSON.stringify({ error: "Missing studyMaterial" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const materialBlock = `Study material:\n---\n${studyMaterial}\n---\n`;
    const topicLine = concept?.trim()
      ? `Explain "${concept}" in full depth using the study material above as your primary source.`
      : `Analyze the study material above completely.`;

    const prompt = `You are an expert teacher. Always respond in valid JSON only, no markdown outside JSON, no code fences.

${materialBlock}
${topicLine}
Return a JSON object with this exact structure:
{
  "title": "${concept?.trim() || 'Topic inferred from the material'}",
  "summary": "2-3 sentence overview",
  "sections": [{ "heading": "Section heading", "type": "text | bullets | table | keyvalue", "content": "..." }],
  "key_terms": [{ "term": "...", "definition": "..." }],
  "key_takeaways": ["...", "...", "..."],
  "common_misconceptions": ["...", "..."],
  "suggested_questions": ["...", "...", "..."]
}

For sections use a mix of types:
- type "text": content is a paragraph string
- type "bullets": content is an array of strings
- type "table": content is { "headers": [...], "rows": [[...],[...]] }
- type "keyvalue": content is [{ "key": "...", "value": "..." }]

Be exhaustive. Cover every concept, definition, formula, and example. Minimum 4 sections.`;

    const apiUrl = `${GEMINI_URL}?key=${GEMINI_API_KEY}`;
    const response = await callGeminiWithRetry(apiUrl, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    });

    if (!response) throw new Error("No response from Gemini");

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gemini API error: ${response.status}`, errData);
      throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(errData)}`);
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!raw) throw new Error("Empty response from Gemini");

    const cleaned = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed:", raw);
      return new Response(JSON.stringify({ error: "JSON parse failed: " + raw.slice(0, 300) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
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
