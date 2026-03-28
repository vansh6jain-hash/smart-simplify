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

export async function generateQuestionBank(
  concept: string,
  studyMaterial: string,
  startLevel: number = 5
) {
  return apiFetch("/api/generate-question", { concept, studyMaterial, startLevel });
}

export async function generateExplanation(
  concept: string,
  level: number,
  studyMaterial: string
) {
  return apiFetch("/api/generate-explanation", { concept, level, studyMaterial });
}

export async function explainMaterial(studyMaterial: string, concept: string) {
  return apiFetch("/api/explain-material", { studyMaterial, concept });
}
