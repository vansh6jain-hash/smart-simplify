import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

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
    const { concept, level, studyMaterial } = await req.json();

    if (!concept || typeof level !== "number") {
      return new Response(JSON.stringify({ error: "Missing concept or level" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const levelDescription = getLevelDescription(level);
    const materialText = studyMaterial?.trim() ? studyMaterial : "No material uploaded.";

    const systemPrompt = "You are an expert teacher. Be concise and engaging.";
    const userPrompt = `The user has studied the following material:\n---\n${materialText}\n---\nExplain "${concept}" to ${levelDescription} in 3–5 sentences. If study material is provided, base your explanation primarily on it — use the same examples, terms, and structure from the material. Add one analogy. Return plain text only, no formatting.`;

    const response = await callGroqWithRetry({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, please wait a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`GROQ API error: ${response.status} - ${errorBody}`);
      return new Response(JSON.stringify({ error: `GROQ API returned status ${response.status}`, details: errorBody }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const explanation = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function runtime error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
