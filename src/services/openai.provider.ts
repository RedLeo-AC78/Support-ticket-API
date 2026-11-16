import { AI_INSTRUCTIONS, AI_RESPONSE_SCHEMA } from "../config/ai-prompt.js";

import type { AiProvider } from "../types/ai.js";

// Configuration serveur uniquement. Aucune URL ni modèle ne vient du ticket.
export function createAiProvider(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): AiProvider | null {
  if (env.AI_ENABLED === undefined || env.AI_ENABLED === "false") return null;

  if (env.AI_ENABLED !== "true")
    throw new Error("AI_ENABLED doit être true ou false.");

  const key = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim();

  if (!key || !model || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model))
    throw new Error(
      "Renseigner OPENAI_API_KEY et OPENAI_MODEL avant d'activer l'IA.",
    );

  // Quota local conservateur : pas un plafond de facturation du compte OpenAI.
  let active = 0;
  let requests = 0;
  let windowStart = Date.now();

  return {
    name: "openai",
    model,
    async analyze(ticket) {
      if (Date.now() - windowStart >= 3600000) {
        requests = 0;

        windowStart = Date.now();
      }

      if (active >= 2 || requests >= 30)
        throw new Error("Quota IA local atteint.");

      active++;

      requests++;

      try {
        const response = await request("https://api.openai.com/v1/responses", {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          redirect: "error",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            store: false,
            instructions: AI_INSTRUCTIONS,
            input: [
              {
                role: "user",
                content: JSON.stringify({
                  title: ticket.title,
                  description: ticket.description,
                }),
              },
            ],
            max_output_tokens: 1800,
            text: {
              format: {
                type: "json_schema",
                name: "ticket_analysis",
                strict: true,
                schema: AI_RESPONSE_SCHEMA,
              },
            },
          }),
        });

        if (!response.ok) throw new Error("Fournisseur IA indisponible.");

        // Borne aussi la réponse HTTP, avant de parser le JSON.
        const reader = response.body?.getReader();

        if (!reader) throw new Error("Réponse IA absente.");

        const chunks: Uint8Array[] = [];
        let length = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            length += value.byteLength;

            if (length > 100000)
              throw new Error("Réponse IA trop volumineuse.");

            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }

        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        if (payload.status !== "completed" || !Array.isArray(payload.output))
          throw new Error("Réponse IA incomplète.");

        const messages = payload.output.filter(
          (item: { type?: string }) => item?.type === "message",
        );
        const parts = messages.flatMap(
          (item: { content?: unknown[] }) => item.content ?? [],
        );

        if (parts.some((part: { type?: string }) => part?.type === "refusal"))
          throw new Error("Réponse IA refusée.");

        const texts = parts.filter(
          (part: { type?: string }) => part?.type === "output_text",
        );

        if (texts.length !== 1 || typeof texts[0].text !== "string")
          throw new Error("Réponse IA invalide.");

        return JSON.parse(texts[0].text);
      } catch {
        // Ne jamais exposer les erreurs fournisseur, le ticket ou la clé.
        throw new Error("Analyse IA indisponible. Reprise humaine nécessaire.");
      } finally {
        active--;
      }
    },
  };
}
