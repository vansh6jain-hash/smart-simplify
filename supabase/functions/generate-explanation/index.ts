import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

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
    const { concept, level, studyMaterial } = await req.json();

    if (!concept || typeof level !== "number") {
      return new Response(JSON.stringify({ error: "Missing concept or level" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const levelDescription = getLevelDescription(level);
    const levelLabel = level <= 3 ? "Child" : level <= 6 ? "Beginner" : "Expert";

    const useMaterial =
      studyMaterial &&
      studyMaterial.replace(/\s/g, "").length > 50 &&
      /[a-zA-Z]{3,}/.test(studyMaterial);
    const materialSection = useMaterial
      ? `Use this study material as your primary source:\n---\n${studyMaterial}\n---\n`
      : "";

    const userPrompt = `You are an expert teacher. Explain "${concept}" to ${levelDescription}.
${materialSection}
Return this exact JSON structure:
{
  "title": "${concept}",
  "summary": "2-3 sentence overview tailored to ${levelLabel} level",
  "sections": [
    {
      "heading": "Section heading",
      "type": "text | bullets | table | keyvalue",
      "content": "..."
    }
  ],
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

Depth and language must match ${levelLabel} level:
- Child: simple words, fun analogies, everyday examples, short sentences
- Beginner: clear language, introduce key terms, relatable analogies
- Expert: technical depth, precise terminology, edge cases, nuances

Minimum 3 sections. Be thorough. Return only valid JSON, no markdown fences.`;

    const response = await callWithRetry({
      model: TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert teacher. Always respond in valid JSON only, no markdown outside JSON, no code fences."
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Empty response from OpenRouter");

    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("generate-explanation JSON parse failed:", text);
      return new Response(JSON.stringify({ error: "JSON parse failed: " + text.slice(0, 300) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Edge function runtime error:", error);
    return new Response(JSON.stringify({ error: error.message || "Unknown error", details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
