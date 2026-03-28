import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TEXT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const VISION_MODEL = "meta-llama/llama-4-maverick:free";

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

function isMeaningfulText(text: string): boolean {
  return text.replace(/\s/g, "").length > 100 && /[a-zA-Z]{3,}/.test(text);
}

async function callWithRetry(body: object, retries = 2): Promise<Response> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  
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

function extractTextFromResponse(data: any): string {
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty response from OpenRouter");
  return text;
}

function parseJsonResponse(text: string): any {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("JSON parse failed: " + text.slice(0, 300));
  }
}

// POST /api/extract-text-from-file
app.post("/api/extract-text-from-file", async (req, res) => {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not set. Add it to your .env file."
    });
  }

  try {
    const { fileBase64, fileMimeType } = req.body;
    if (!fileBase64 || !fileMimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or fileMimeType" });
    }

    let extractedText = "";

    if (fileMimeType === "application/pdf") {
      // STEP 1 — Try pdf-parse for proper text extraction
      const buffer = Buffer.from(fileBase64, "base64");
      let fullText = "";
      try {
        const pdfData = await pdfParse(buffer);
        fullText = pdfData.text || "";
      } catch (pdfErr) {
        console.error("pdf-parse failed:", pdfErr);
        fullText = "";
      }

      // STEP 2 — Validate meaningfulness
      const isMeaningful = fullText.replace(/\s/g, "").length > 100
        && (fullText.match(/[a-zA-Z]{3,}/g) || []).length > 20;

      if (isMeaningful) {
        // Good extraction — clean with OpenRouter
        const truncated = fullText.substring(0, 8000);
        const response = await callWithRetry({
          model: TEXT_MODEL,
          messages: [
            {
              role: "system",
              content: "You are a text cleaner. Return only clean readable text, no commentary."
            },
            {
              role: "user",
              content: `Clean this raw PDF text and return all meaningful content as plain text:\n\n${truncated}`
            }
          ],
          temperature: 0.3,
          max_tokens: 1500
        });
        const data = await response.json();
        extractedText = extractTextFromResponse(data);
      } else {
        // STEP 3 — PDF not meaningful
        return res.status(422).json({
          error: "unreadable",
          message: "Could not extract text from this PDF. Please upload a PNG or JPG photo of your notes instead."
        });
      }
    } else {
      // Images — use vision model
      const response = await callWithRetry({
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${fileMimeType};base64,${fileBase64}`
                }
              },
              {
                type: "text",
                text: "Extract ALL text, headings, definitions, formulas, bullet points, and key concepts from this image. Preserve structure. Return as clean plain text only."
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const data = await response.json();
      extractedText = extractTextFromResponse(data);
    }

    // STEP 5 — Validate final output
    const finalCheck = extractedText.replace(/\s/g, "").length > 50 && /[a-zA-Z]{3,}/.test(extractedText);
    if (!finalCheck) {
      return res.status(422).json({
        error: "unreadable",
        message: "Could not read file clearly."
      });
    }

    return res.json({ extractedText });
  } catch (error: any) {
    console.error("extract-text-from-file error:", error);
    return res.status(500).json({
      error: error.message || "Unknown error",
      details: String(error)
    });
  }
});

// OPTIONS handler for CORS preflight
app.options("/api/generate-question", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

// POST /api/generate-question — batch generates 15 questions (5 per difficulty tier)
app.post("/api/generate-question", async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not set. Add it to your .env file."
    });
  }

  try {
    const { concept, studyMaterial, startLevel } = req.body;
    if (!concept) {
      return res.status(400).json({ error: "Missing concept" });
    }

    const levelDescription = (l: number) =>
      l <= 3
        ? "child aged 7-10, simple everyday words, zero jargon"
        : l <= 6
        ? "beginner, some basic terminology okay"
        : "expert, full technical terminology, deep concepts";

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
    const raw = extractTextFromResponse(data);
    const parsed = parseJsonResponse(raw);

    // Validate the response has all 3 groups with at least 3 items each
    if (
      !parsed.child ||
      !parsed.beginner ||
      !parsed.expert ||
      parsed.child.length < 3 ||
      parsed.beginner.length < 3 ||
      parsed.expert.length < 3
    ) {
      return res.status(500).json({ error: "Invalid question bank structure from OpenRouter" });
    }

    return res.json({ questionBank: parsed });
  } catch (error: any) {
    console.error("generate-question error:", error);
    return res.status(500).json({
      error: error.message || "Unknown error",
      details: String(error)
    });
  }
});

// POST /api/generate-explanation — returns structured JSON
app.post("/api/generate-explanation", async (req, res) => {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not set. Add it to your .env file."
    });
  }

  try {
    const { concept, level, studyMaterial } = req.body;
    if (!concept || typeof level !== "number") {
      return res.status(400).json({ error: "Missing concept or level" });
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
    const raw = extractTextFromResponse(data);
    const parsed = parseJsonResponse(raw);

    return res.json(parsed);
  } catch (error: any) {
    console.error("generate-explanation error:", error);
    return res.status(500).json({
      error: error.message || "Unknown error",
      details: String(error)
    });
  }
});

// POST /api/explain-material — deep structured explanation of uploaded material
app.post("/api/explain-material", async (req, res) => {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not set. Add it to your .env file."
    });
  }

  try {
    const { studyMaterial, concept } = req.body;
    if (!studyMaterial?.trim()) {
      return res.status(400).json({ error: "Missing studyMaterial" });
    }

    // Validate material is readable before asking to analyze it
    const materialValidationPrefix = `If the study material below appears to be corrupted, empty, or contains only special characters with no meaningful words, respond with this exact JSON:
{ "error": "material_unreadable", "message": "The uploaded file could not be read properly." }

Otherwise, analyze and explain the material fully.
Study material:
---
${studyMaterial}
---`;

    let userPrompt: string;

    if (concept?.trim()) {
      userPrompt = `${materialValidationPrefix}

Explain "${concept}" in full depth using the study material above as your primary source.
Return a JSON object with this exact structure:
{
  "title": "${concept}",
  "summary": "2-3 sentence overview focused on ${concept} as covered in this material",
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

Be exhaustive. Cover every concept, definition, formula, and example in the material. Minimum 4 sections. Return only valid JSON, no markdown fences.`;
    } else {
      userPrompt = `${materialValidationPrefix}

Analyze the study material above completely and return a JSON object with this exact structure:
{
  "title": "Topic name inferred from the material",
  "summary": "2-3 sentence overview of what this material covers",
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

Be exhaustive. Cover every concept, definition, formula, and example present in the material. Minimum 4 sections. Return only valid JSON, no markdown fences.`;
    }

    const response = await callWithRetry({
      model: TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert teacher and academic explainer. Always respond in valid JSON only, no markdown outside JSON, no code fences."
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
    const raw = extractTextFromResponse(data);
    const parsed = parseJsonResponse(raw);

    return res.json(parsed);
  } catch (error: any) {
    console.error("explain-material error:", error);
    return res.status(500).json({
      error: error.message || "Unknown error",
      details: String(error)
    });
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
