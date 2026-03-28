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

    const prompt = `Generate exactly 15 unique MCQ questions about "${concept}".
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

    const response = await callGeminiWithRetry({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 3000,
      },
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, please wait a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errorBody}`);
      return new Response(JSON.stringify({ error: `Gemini API returned status ${response.status}`, details: errorBody }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse failed:", raw.slice(0, 500));
      return new Response(JSON.stringify({ error: "JSON parse failed: " + raw.slice(0, 500) }), {
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
      return new Response(JSON.stringify({ error: "Invalid question bank structure from Gemini" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ questionBank: parsed }), {
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
