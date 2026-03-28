import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

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

const levelDescription = (l: number) =>
  l <= 3
    ? "child aged 7-10, simple everyday words, zero jargon"
    : l <= 6
    ? "beginner, some basic terminology okay"
    : "expert, full technical terminology, deep concepts";

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
    const { concept, studyMaterial, startLevel } = await req.json();

    if (!concept) {
      return new Response(JSON.stringify({ error: "Missing concept" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const materialBlock = studyMaterial?.trim()
      ? `Base ALL questions on this study material as the primary source:\n---\n${studyMaterial}\n---`
      : "";

    const userPrompt = `Generate exactly 15 unique MCQ questions about "${concept}".
${materialBlock}

Create exactly 3 groups of exactly 5 questions each:

Group "child": difficulty 2/10
- Language suitable for ${levelDescription(2)}
- Use simple analogies and everyday examples
- Avoid any technical terms

Group "beginner": difficulty 5/10  
- Language suitable for ${levelDescription(5)}
- Introduce key terms with brief context
- Use relatable real-world examples

Group "expert": difficulty 8/10
- Language suitable for ${levelDescription(8)}
- Use precise technical terminology
- Test deep understanding and edge cases

Rules:
- All 15 questions must be unique, no repetition
- Cover different aspects of the topic across all questions
- Each question must have exactly 4 options labeled A) B) C) D)
- correct field must be exactly one of: "A", "B", "C", or "D"

Return ONLY this exact JSON structure, no markdown, no code fences, no extra text:
{
  "child": [
    {
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correct": "A",
      "explanation": "One sentence why this answer is correct."
    }
  ],
  "beginner": [ ...exactly 5 items... ],
  "expert": [ ...exactly 5 items... ]
}`;

    const response = await callWithRetry({
      model: TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: "You generate MCQ quiz questions. Respond ONLY with valid JSON, no markdown fences, no extra text."
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Empty response from OpenRouter");

    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse failed:", text.slice(0, 500));
      return new Response(JSON.stringify({ error: "JSON parse failed: " + text.slice(0, 300) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the response has all 3 groups with at least 3 items each
    if (
      !parsed.child ||
      !parsed.beginner ||
      !parsed.expert ||
      parsed.child.length < 3 ||
      parsed.beginner.length < 3 ||
      parsed.expert.length < 3
    ) {
      return new Response(JSON.stringify({ error: "Invalid question bank structure from OpenRouter" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ questionBank: parsed }), {
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
