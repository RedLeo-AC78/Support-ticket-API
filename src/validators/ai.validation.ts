import type { AiAnalysis } from "../types/ai.js";

// Une réponse structurée du modèle reste une entrée non fiable.
export function aiAnalysis(value: unknown): AiAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Réponse IA invalide.");

  const body = value as Record<string, unknown>;
  const keys = ["classification", "answer", "reason", "requiresHuman"];

  if (
    Object.keys(body).length !== keys.length ||
    Object.keys(body).some((key) => !keys.includes(key)) ||
    !["IT_SUPPORT", "OFF_TOPIC", "NEEDS_REVIEW"].includes(
      String(body.classification),
    ) ||
    typeof body.classification !== "string" ||
    typeof body.answer !== "string" ||
    body.answer.length > 6000 ||
    typeof body.reason !== "string" ||
    !body.reason.trim() ||
    body.reason.length > 500 ||
    typeof body.requiresHuman !== "boolean"
  )
    throw new Error("Réponse IA invalide.");

  if (
    body.classification === "IT_SUPPORT" &&
    !body.requiresHuman &&
    !body.answer.trim()
  )
    throw new Error("Réponse IA vide.");

  return {
    classification: body.classification as AiAnalysis["classification"],
    answer: body.answer.trim(),
    reason: body.reason.trim(),
    requiresHuman: body.requiresHuman,
  };
}
