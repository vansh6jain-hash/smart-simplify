# KnowFirst AI

An adaptive AI-powered quiz app that assesses your knowledge level on any topic using multiple-choice questions and provides rich structured explanations powered by OpenRouter (LLaMA 3.3 70B).

## Architecture

**Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui  
**Backend**: Express.js server (TypeScript via tsx in dev)

### Dev server setup
- Vite dev server on **port 5000** (the webview port)
- Express API server on **port 3000**
- Vite proxies all `/api/*` requests to Express

## Home Screen — 4 Input Cases

| Case | Concept | File | Action |
|------|---------|------|--------|
| 1 | Yes | No | 5 MCQs -> level detection -> structured explanation |
| 2 | Yes | Yes | 5 MCQs grounded in material -> structured explanation |
| 3 | No | Yes | Skip quiz -> full material breakdown (MaterialExplainScreen) |
| 4 | No | No | Inline validation error — cannot proceed |

## Key Files

### Server
- `server/index.ts` — Express API with 4 endpoints:
  - `POST /api/extract-text-from-file` — Extracts text from PDF/image using OpenRouter vision (LLaMA 4 Maverick)
  - `POST /api/generate-question` — Batch generates 15 MCQ questions (5 per difficulty tier) via OpenRouter
  - `POST /api/generate-explanation` — Returns **structured JSON** explanation at the user's level (2000 tokens)
  - `POST /api/explain-material` — Deep structured breakdown of uploaded material (2000 tokens)

### Frontend
- `src/lib/api.ts` — Typed fetch wrappers for all API endpoints
- `src/pages/Index.tsx` — App state machine: home | quiz | result | material-explain
- `src/components/HomeScreen.tsx` — 4-case logic, file upload, validation
- `src/components/QuizScreen.tsx` — Adaptive MCQ with difficulty scaling (1–10)
- `src/components/ResultScreen.tsx` — Score + difficulty curve + ExplanationRenderer
- `src/components/MaterialExplainScreen.tsx` — File-only path: full material breakdown
- `src/components/ExplanationRenderer.tsx` — Rich renderer for structured explanation JSON

### ExplanationRenderer — Structured JSON Format
```json
{
  "title": "...",
  "summary": "...",
  "sections": [
    { "heading": "...", "type": "text|bullets|table|keyvalue", "content": "..." }
  ],
  "key_terms": [{ "term": "...", "definition": "..." }],
  "key_takeaways": ["..."],
  "common_misconceptions": ["..."],
  "suggested_questions": ["..."]
}
```

## Environment Variables / Secrets

- `OPENROUTER_API_KEY` — Required. OpenRouter API key. Kept server-side only.

## Dev

```
npm run dev
```

Starts Express (port 3000) and Vite (port 5000) concurrently.

## Notes

- Migrated from Lovable (Supabase Edge Functions -> Express routes)
- No database — all state is in-memory per session
- Suggested questions on ExplanationRenderer pre-fill concept via sessionStorage + navigate to home
- Uses OpenRouter API with free LLaMA models (meta-llama/llama-3.3-70b-instruct:free for text, meta-llama/llama-4-maverick:free for vision)
