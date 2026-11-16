// Le fournisseur propose une analyse. Seul le service métier décide de son effet.
export type AiClassification = "IT_SUPPORT" | "OFF_TOPIC" | "NEEDS_REVIEW";

export interface AiAnalysis {
  classification: AiClassification;
  answer: string;
  reason: string;
  requiresHuman: boolean;
}

export interface AiProvider {
  name: string;
  model: string;
  analyze(ticket: { title: string; description: string }): Promise<unknown>;
}
