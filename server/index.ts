import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

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
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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

// POST /api/extract-text-from-file
app.post("/api/extract-text-from-file", async (req, res) => {
  try {
    const { fileBase64, fileMimeType } = req.body;
    if (!fileBase64 || !fileMimeType) {
      return res.status(400).json({ error: "Missing fileBase64 or fileMimeType" });
    }

    let extractedText = "";

    if (fileMimeType === "application/pdf") {
      const binaryStr = Buffer.from(fileBase64, "base64").toString("binary");
      const textChunks: string[] = [];
      const regex = /\(([^)]+)\)/g;
      let match;
      while ((match = regex.exec(binaryStr)) !== null) {
        const chunk = match[1];
        if (chunk.length > 1 && /[a-zA-Z]/.test(chunk)) {
          textChunks.push(chunk);
        }
      }
      const rawPdfText = textChunks.join(" ").substring(0, 8000);

      if (rawPdfText.trim().length < 20) {
        extractedText =
          "PDF text extraction yielded minimal content. The quiz will rely on the concept name.";
      } else {
        const response = await callGroqWithRetry({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You extract and summarize key concepts from text." },
            {
              role: "user",
              content: `Extract all key concepts, definitions, and important points from this text. Return as organized plain text:\n\n${rawPdfText}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        });

        if (!response.ok) throw new Error(`GROQ API returned ${response.status}`);
        const data = await response.json() as any;
        extractedText = data?.choices?.[0]?.message?.content?.trim() ?? "";
      }
    } else {
      const response = await callGroqWithRetry({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${fileMimeType};base64,${fileBase64}` },
              },
              {
                type: "text",
                text: "Extract all text, key concepts, definitions, and important points from this image. Return as plain text.",
              },
            ],
          },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      if (response.status === 429) {
        return res.status(429).json({ error: "Rate limited, please wait a moment." });
      }
      if (!response.ok) {
        const errBody = await response.text();
        console.error(`GROQ vision error: ${response.status} - ${errBody}`);
        throw new Error(`GROQ API returned ${response.status}`);
      }

      const data = await response.json() as any;
      extractedText = data?.choices?.[0]?.message?.content?.trim() ?? "";
    }

    return res.json({ extractedText });
  } catch (error) {
    console.error("extract-text-from-file error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
    const materialText = studyMaterial?.trim() ? studyMaterial : "No material uploaded.";

    const systemPrompt =
      "You generate MCQ quiz questions. Respond ONLY with valid JSON, no markdown fences, no extra text.";
    const userPrompt = `The user is studying the following material:\n---\n${materialText}\n---\nGenerate 1 MCQ about "${concept}" for ${levelDescription} (difficulty ${level}/10). If study material is provided, base the question primarily on it. Avoid repeating these questions: ${historyText}.\nReturn ONLY this JSON:\n{ "question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": "A", "explanation": "One sentence why the correct answer is right." }`;

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
      return res.status(429).json({ error: "Rate limited, please wait a moment." });
    }
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`GROQ API error: ${response.status} - ${errorBody}`);
      return res.status(response.status).json({ error: `GROQ API returned status ${response.status}` });
    }

    const data = await response.json() as any;
    const rawText = data?.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed:", rawText);
      return res.status(500).json({ error: "JSON parse failed: " + rawText });
    }

    return res.json(parsed);
  } catch (error) {
    console.error("generate-question error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
      return res.status(429).json({ error: "Rate limited, please wait a moment." });
    }
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`GROQ API error: ${response.status} - ${errorBody}`);
      return res.status(response.status).json({ error: `GROQ API returned status ${response.status}`, details: errorBody });
    }

    const data = await response.json() as any;
    const explanation = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return res.json({ explanation });
  } catch (error) {
    console.error("generate-explanation error:", error);
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
