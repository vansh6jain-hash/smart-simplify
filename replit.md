# KnowFirst AI

An adaptive AI-powered quiz app that assesses your knowledge level on any topic using multiple-choice questions powered by GROQ's LLaMA models.

## Architecture

**Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui  
**Backend**: Express.js server (TypeScript, compiled with tsx in dev)

### How it works
- The Vite dev server runs on **port 5000** (the webview port)
- The Express API server runs on **port 3000**
- Vite proxies all `/api/*` requests to the Express server
- In production, the Express server serves the built frontend static files

## Key Files

- `server/index.ts` — Express API server with three endpoints:
  - `POST /api/extract-text-from-file` — Extracts text from uploaded PDF/image using GROQ
  - `POST /api/generate-question` — Generates adaptive MCQ questions via GROQ LLaMA
  - `POST /api/generate-explanation` — Generates concept explanations via GROQ LLaMA
- `src/lib/api.ts` — Frontend API client (wraps fetch calls to `/api/*`)
- `src/components/HomeScreen.tsx` — Landing page with concept input and file upload
- `src/components/QuizScreen.tsx` — Adaptive quiz with difficulty scaling
- `src/components/ResultScreen.tsx` — Results with level, score, and AI explanation

## Environment Variables / Secrets

- `GROQ_API_KEY` — Required. GROQ API key for LLaMA model access.

## Dev

```
npm run dev
```

Starts the Express server and Vite dev server concurrently.

## Notes

- Migrated from Lovable (Supabase Edge Functions → Express server routes)
- No database needed — all state is in-memory per session
- GROQ API key is kept server-side only, never exposed to the browser
