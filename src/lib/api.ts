import { supabase } from "@/integrations/supabase/client";

async function invokeFunction(name: string, body: unknown) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    throw new Error(error.message || `Edge function "${name}" failed`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function extractTextFromFile(fileBase64: string, fileMimeType: string) {
  return invokeFunction("extract-text-from-file", { fileBase64, fileMimeType });
}

export async function generateQuestion(
  concept: string,
  level: number,
  questionHistory: string[],
  studyMaterial: string
) {
  return invokeFunction("generate-question", { concept, level, questionHistory, studyMaterial });
}

export async function generateExplanation(
  concept: string,
  level: number,
  studyMaterial: string
) {
  return invokeFunction("generate-explanation", { concept, level, studyMaterial });
}

export async function explainMaterial(studyMaterial: string, concept: string) {
  return invokeFunction("explain-material", { studyMaterial, concept });
}
