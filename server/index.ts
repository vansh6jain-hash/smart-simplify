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

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.GEMINI_API_KEY}`;

function getLevelDescription(level: number): string {
  if (level <= 3) return "a child aged 7–10, use simple everyday words, no jargon";
  if (level <= 6) return "a beginner, some basic terminology is okay";
  return "an expert, use full technical terminology";
}

function isMeaningfulText(text: string): boolean {
  return text.replace(/\s/g, "").length > 100 && /[a-zA-Z]{3,}/.test(text);
}

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

// POST /api/extract-text-from-file
app.post("/api/extract-text-from-file", async (req, res) => {
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
      if (isMeaningfulText(fullText)) {
        // Good extraction — summarise with Gemini
        const truncated = fullText.substring(0, 8000);
        const response = await callGeminiWithRetry({
          contents: [
            {
              parts: [
                {
                  text: `You extract and summarize key concepts from text. Extract all key concepts, definitions, and important points from this text. Return as organized plain text:\n\n${truncated}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        });
        if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
        const data = (await response.json()) as any;
        extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      } else {
        // STEP 3 — Fall back to Gemini vision on the raw PDF
        console.log("pdf-parse text not meaningful, falling back to Gemini vision");
        const visionResponse = await callGeminiWithRetry({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: fileMimeType,
                    data: fileBase64,
                  },
                },
                {
                  text: "This is a page from a study document. Extract ALL text, headings, definitions, formulas, and key concepts visible. Return as clean plain text preserving structure.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        });

        if (visionResponse.status === 429) {
          return res.status(429).json({ error: "Rate limited, please wait a moment." });
        }

        if (visionResponse.ok) {
          const visionData = (await visionResponse.json()) as any;
          const visionText = visionData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
          if (isMeaningfulText(visionText)) {
            extractedText = visionText;
          } else {
            // STEP 4 — Still not meaningful
            return res.status(422).json({
              error:
                "Could not extract text from this PDF. Please try uploading a clearer file or a PNG/JPG image of your notes.",
            });
          }
        } else {
          return res.status(422).json({
            error:
              "Could not extract text from this PDF. Please try uploading a clearer file or a PNG/JPG image of your notes.",
          });
        }
      }
    } else {
      // Images — use Gemini vision directly
      const response = await callGeminiWithRetry({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: fileMimeType,
                  data: fileBase64,
                },
              },
              {
                text: "Extract all text, key concepts, definitions, and important points from this image. Return as plain text.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
        },
      });

      if (response.status === 429) {
        return res.status(429).json({ error: "Rate limited, please wait a moment." });
      }
      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Gemini vision error: ${response.status} - ${errBody}`);
        throw new Error(`Gemini API returned ${response.status}`);
      }

      const data = (await response.json()) as any;
      extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    }

    return res.json({ extractedText });
  } catch (error) {
    console.error("extract-text-from-file error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// OPTIONS handler for CORS preflight
app.options('/api/generate-question', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// POST /api/generate-question — batch generates 15 questions (5 per difficulty tier)
app.post("/api/generate-question", async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
      return res.status(429).json({ error: "Rate limited, please wait a moment." });
    }
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errorBody}`);
      return res.status(response.status).json({ error: `Gemini API returned status ${response.status}` });
    }

    const data = (await response.json()) as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse failed:", raw.slice(0, 500));
      return res.status(500).json({ error: "JSON parse failed: " + raw.slice(0, 500) });
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
      return res.status(500).json({ error: "Invalid question bank structure from Gemini" });
    }

    return res.json({ questionBank: parsed });
  } catch (error) {
    console.error("generate-question error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /api/generate-explanation — returns structured JSON
app.post("/api/generate-explanation", async (req, res) => {
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

    const prompt = `You are an expert teacher. Explain "${concept}" to ${levelDescription}.
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

    const response = await callGeminiWithRetry({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Rate limited, please wait a moment." });
    }
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errorBody}`);
      return res.status(response.status).json({ error: `Gemini API returned status ${response.status}`, details: errorBody });
    }

    const data = (await response.json()) as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("generate-explanation JSON parse failed:", rawText);
      return res.status(500).json({ error: "JSON parse failed" });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("generate-explanation error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// POST /api/explain-material — deep structured explanation of uploaded material
app.post("/api/explain-material", async (req, res) => {
  try {
    const { studyMaterial, concept } = req.body;
    if (!studyMaterial?.trim()) {
      return res.status(400).json({ error: "Missing studyMaterial" });
    }

    // BUG 4 — validate material is readable before asking Gemini to analyze it
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

    const response = await callGeminiWithRetry({
      contents: [
        {
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Rate limited, please wait a moment." });
    }
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini API error: ${response.status} - ${errorBody}`);
      return res.status(response.status).json({ error: `Gemini API returned status ${response.status}` });
    }

    const data = (await response.json()) as any;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("explain-material JSON parse failed:", rawText);
      return res.status(500).json({ error: "JSON parse failed" });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("explain-material error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
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
