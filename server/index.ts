import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

function isMeaningfulText(text: string): boolean {
  return text.replace(/\s/g, "").length > 100 && /[a-zA-Z]{3,}/.test(text);
}

async function callGeminiWithRetry(body: object, retries = 3) {
  const url = `${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`;
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

function extractGeminiText(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// POST /api/extract-text-from-file
app.post("/api/extract-text-from-file", async (req, res) => {
  try {
    const { fileBase64, fileMimeType } = req.body;
    if (!fileBase64 || !fileMimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or fileMimeType" });
    }

    // Gemini 2.0 Flash handles PDF, PNG, JPG, WEBP natively via inline_data
    const response = await callGeminiWithRetry({
      contents: [{
        parts: [
          { inline_data: { mime_type: fileMimeType, data: fileBase64 } },
          { text: "Extract ALL text, headings, definitions, formulas, bullet points, and key concepts from this document. Preserve the structure and order. Return as clean plain text only." },
        ],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
    });

    if (!response) throw new Error("No response from Gemini");
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Gemini file error ${response.status}: ${JSON.stringify(errData)}`);
    }

    const data = await response.json();
    const extractedText = extractGeminiText(data);

    if (!extractedText || extractedText.replace(/\s/g, "").length < 50) {
      return res.json({
        error: "unreadable",
        message: "Could not extract text from this file. Try uploading a clearer image (PNG or JPG) of your notes.",
      });
    }

    return res.json({ extractedText });
  } catch (error) {
    console.error("extract-text-from-file error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST /api/generate-question
app.post("/api/generate-question", async (req, res) => {
  try {
    const { concept, level, questionHistory, studyMaterial } = req.body;
    if (!concept || typeof level !== "number") {
      return res.status(400).json({ error: "Missing concept or level" });
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

    const response = await callGeminiWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    });

    if (!response) throw new Error("No response from Gemini");
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gemini API error: ${response.status}`, errData);
      return res.status(response.status).json({ error: `Gemini API error ${response.status}` });
    }

    const data = await response.json();
    const raw = extractGeminiText(data);
    if (!raw) throw new Error("Empty response from Gemini");

    const cleaned = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed:", raw);
      return res.status(500).json({ error: "JSON parse failed: " + raw.slice(0, 300) });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("generate-question error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST /api/generate-explanation
app.post("/api/generate-explanation", async (req, res) => {
  try {
    const { concept, level, studyMaterial } = req.body;
    if (!concept || typeof level !== "number") {
      return res.status(400).json({ error: "Missing concept or level" });
    }

    const levelDescription = getLevelDescription(level);
    const levelLabel = level <= 3 ? "Child" : level <= 6 ? "Beginner" : "Expert";

    const useMaterial =
      studyMaterial && studyMaterial.replace(/\s/g, "").length > 50 && /[a-zA-Z]{3,}/.test(studyMaterial);
    const materialSection = useMaterial
      ? `Use this study material as your primary source:\n---\n${studyMaterial}\n---\n`
      : "";

    const prompt = `You are an expert teacher. Always respond in valid JSON only, no markdown outside JSON, no code fences.

Explain "${concept}" to ${levelDescription}.
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

Minimum 3 sections. Be thorough.`;

    const response = await callGeminiWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    });

    if (!response) throw new Error("No response from Gemini");
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gemini API error: ${response.status}`, errData);
      return res.status(response.status).json({ error: `Gemini API error ${response.status}` });
    }

    const data = await response.json();
    const raw = extractGeminiText(data);
    if (!raw) throw new Error("Empty response from Gemini");

    let parsed;
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("generate-explanation JSON parse failed:", raw);
      return res.status(500).json({ error: "JSON parse failed" });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("generate-explanation error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// POST /api/explain-material
app.post("/api/explain-material", async (req, res) => {
  try {
    const { studyMaterial, concept } = req.body;
    if (!studyMaterial?.trim()) {
      return res.status(400).json({ error: "Missing studyMaterial" });
    }

    const materialValidationPrefix = `If the study material below appears to be corrupted, empty, or contains only special characters with no meaningful words, respond with this exact JSON:
{ "error": "material_unreadable", "message": "The uploaded file could not be read properly." }

Otherwise, analyze and explain the material fully.
Study material:
---
${studyMaterial}
---`;

    let prompt: string;

    if (concept?.trim()) {
      prompt = `You are an expert teacher and academic explainer. You produce deeply structured, comprehensive, and clear explanations. Always respond in valid JSON only — no markdown outside the JSON, no code fences.

${materialValidationPrefix}

Explain "${concept}" in full depth using the study material above as your primary source.
Return a JSON object with this exact structure:
{
  "title": "${concept}",
  "summary": "2-3 sentence overview focused on ${concept} as covered in this material",
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

Be exhaustive. Cover every concept, definition, formula, and example in the material. Minimum 4 sections.`;
    } else {
      prompt = `You are an expert teacher and academic explainer. You produce deeply structured, comprehensive, and clear explanations. Always respond in valid JSON only — no markdown outside the JSON, no code fences.

${materialValidationPrefix}

Analyze the study material above completely and return a JSON object with this exact structure:
{
  "title": "Topic name inferred from the material",
  "summary": "2-3 sentence overview of what this material covers",
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

Be exhaustive. Cover every concept, definition, formula, and example present in the material. Minimum 4 sections.`;
    }

    const response = await callGeminiWithRetry({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    });

    if (!response) throw new Error("No response from Gemini");
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`Gemini API error: ${response.status}`, errData);
      return res.status(response.status).json({ error: `Gemini API error ${response.status}` });
    }

    const data = await response.json();
    const raw = extractGeminiText(data);
    if (!raw) throw new Error("Empty response from Gemini");

    let parsed;
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("explain-material JSON parse failed:", raw);
      return res.status(500).json({ error: "JSON parse failed" });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("explain-material error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
