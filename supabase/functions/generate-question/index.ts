import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

function extractJson(raw: string): unknown {
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const end = cleaned.lastIndexOf(start !== -1 && cleaned[start] === "[" ? "]" : "}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned);
  }
}

async function callAiWithRetry(prompt: string, lovableApiKey: string) {
  const maxRetries = 4;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a quiz question generator. Return ONLY valid raw JSON, no markdown, no code fences." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (response.ok) {
      return response;
    }

    const errText = await response.text();
    console.error(`AI gateway error attempt ${attempt + 1}:`, response.status, errText);

    if (response.status === 429 && attempt < maxRetries) {
      const delay = Math.min(12000, 1200 * 2 ** attempt) + Math.floor(Math.random() * 500);
      await sleep(delay);
      continue;
    }

    return new Response(errText, { status: response.status });
  }

  return new Response(JSON.stringify({ error: "Max retries reached" }), { status: 429 });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { concept, level, questionHistory } = await req.json();

    if (!concept || typeof level !== "number") {
      return new Response(JSON.stringify({ error: "Missing concept or level" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const levelDescription = getLevelDescription(level);
    const historyText = questionHistory?.length ? questionHistory.join("; ") : "None";
    const prompt = `Generate 1 MCQ about "${concept}" for ${levelDescription} (difficulty ${level}/10). Previous questions already asked: ${historyText}. Return ONLY raw JSON with no markdown, no code fences, no extra text: { "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": "A", "explanation": "One sentence why correct." }`;

    const response = await callAiWithRetry(prompt, LOVABLE_API_KEY);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "We hit a temporary AI rate limit. Please wait a few seconds and retry." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content ?? "";
    const question = extractJson(rawText);

    return new Response(JSON.stringify(question), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-question error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
