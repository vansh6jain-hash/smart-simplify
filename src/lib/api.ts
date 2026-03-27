async function apiFetch(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data?.error ?? `HTTP ${res.status}`), { status: res.status });
  }
  return data;
}

export async function extractTextFromFile(fileBase64: string, fileMimeType: string) {
  return apiFetch("/api/extract-text-from-file", { fileBase64, fileMimeType });
}

export async function generateQuestion(
  concept: string,
  level: number,
  questionHistory: string[],
  studyMaterial: string
) {
  return apiFetch("/api/generate-question", { concept, level, questionHistory, studyMaterial });
}

export async function generateExplanation(
  concept: string,
  level: number,
  studyMaterial: string
) {
  return apiFetch("/api/generate-explanation", { concept, level, studyMaterial });
}
