import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

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
    const { concept, level, questionHistory, studyMaterial } = await req.json();

    if (!concept || typeof level !== "number") {
      return new Response(JSON.stringify({ error: "Missing concept or level" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const levelDescription = getLevelDescription(level);
    const historyText = questionHistory?.length ? questionHistory.join("; ") : "None";

    const useMaterial =
      studyMaterial && studyMaterial.replace(/\s/g, "").length > 50 && /[a-zA-Z]{3,}/.test(studyMaterial);
    const materialBlock = useMaterial
      ? `Use this study material as context:\n---\n${studyMaterial}\n---\n`
      : "";

    const prompt = `You generate MCQ quiz questions. Respond ONLY with valid JSON, no markdown fences, no extra text.

${materialBlock}Generate 1 MCQ about "${concept}" for ${levelDescription} (difficulty ${level}/10). Avoid repeating these questions: ${historyText}.
Return ONLY this JSON:
{ "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": "A", "explanation": "One sentence why the correct answer is right." }`;

    const apiUrl = `${GEMINI_URL}?key=${Deno.env.get("GEMINI_API_KEY")}`;
    const response = await callGeminiWithRetry(apiUrl, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    });

    if (!response) throw new Error("No response from Gemini");

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gemini API error: ${response.status}`, errData);
      return new Response(JSON.stringify({ error: `Gemini API error ${response.status}` }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    console.error("Edge function runtime error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
