import { randomUUID } from "node:crypto";
import { authorizeTicketStatus } from "../repositories/ticket-authorization.js";

import type {
  PrismaClient,
  Prisma,
  AiState,
} from "../generated/prisma/client.js";

import type { AiProvider } from "../types/ai.js";

import { AI_PROMPT_VERSION } from "../config/ai-prompt.js";
import { ticketVisibility, type TicketActor } from "../config/ticket-access.js";

import { aiAnalysis } from "../validators/ai.validation.js";
import { ticketId } from "../validators/tickets.validation.js";

import { HttpError, objectBody } from "../utils/security.js";

const conflict = () =>
  new HttpError(
    409,
    "Le ticket a changé ou ne permet plus cette opération IA. Rechargez-le.",
  );

// Garde complémentaire, pas un détecteur exhaustif de secrets.
export function containsLikelySecret(text: string) {
  return /-----BEGIN .*PRIVATE KEY-----|\bsk-[\w-]{15,}|(?:password|mot de passe|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i.test(
    text,
  );
}

export function ticketAiService(db: PrismaClient, provider: AiProvider | null) {
  async function audit(
    tx: Prisma.TransactionClient,
    actorId: number,
    id: number,
    action: string,
    before: string,
    after: string,
  ) {
    await tx.auditLog.create({
      data: {
        actorId,
        targetId: id,
        targetType: "TICKET",
        action,
        before,
        after,
      },
    });
  }

  async function analyze(
    value: string | string[],
    actor: TicketActor,
    sessionId = "",
    origin: "creation" | "retry" = "retry",
  ) {
    const id = ticketId(value);

    if (!provider) throw new HttpError(503, "L'assistance IA est désactivée.");

    const attemptId = randomUUID();

    const ticket = await db.$transaction(async (tx) => {
      const currentScope = await authorizeTicketStatus(
        tx,
        actor.id,
        sessionId,
        origin === "creation" ? "tickets:create" : "tickets:update-status",
      );
      const current = await tx.ticket.findFirst({
        where: { id, AND: [ticketVisibility(actor), currentScope] },
        include: { ai: true },
      });

      if (!current) throw new HttpError(404, "Ticket introuvable.");
      if (origin === "creation" && current.ownerId !== actor.id)
        throw new HttpError(
          403,
          "Analyse automatique réservée au ticket du créateur.",
        );

      if (!["OPEN", "IN_PROGRESS"].includes(current.status)) throw conflict();

      if (
        current.ai &&
        (current.ai.attempts >= 3 ||
          (current.ai.state !== "FAILED" &&
            !(
              current.ai.state === "PROCESSING" &&
              current.ai.updatedAt.getTime() < Date.now() - 60000
            )))
      )
        throw new HttpError(
          409,
          "Analyse déjà disponible ou limite de trois tentatives atteinte. Un agent peut reprendre le ticket.",
        );

      const claimed = await tx.ticket.updateMany({
        where: { id, revision: current.revision },
        data: { revision: { increment: 1 } },
      });

      if (claimed.count !== 1) throw conflict();

      const data = {
        state: "PROCESSING" as const,
        classification: null,
        answer: null,
        reason: "Analyse en cours.",
        provider: provider.name,
        model: provider.model,
        promptVersion: AI_PROMPT_VERSION,
        attemptId,
        ticketRevision: current.revision + 1,
      };

      await tx.ticketAi.upsert({
        where: { ticketId: id },
        create: { ticketId: id, ...data },
        update: { ...data, attempts: { increment: 1 } },
      });

      await audit(
        tx,
        actor.id,
        id,
        "TICKET_AI_REQUESTED",
        current.ai?.state ?? "NONE",
        "PROCESSING",
      );

      return { ...current, revision: current.revision + 1 };
    });

    let state: AiState = "FAILED";
    let classification: string | null = null;
    let answer: string | null = null;
    let reason =
      "Analyse indisponible. Le ticket reste disponible pour un agent.";

    if (containsLikelySecret(ticket.title + "\n" + ticket.description)) {
      state = "NEEDS_REVIEW";

      reason =
        "Contenu potentiellement sensible : analyse externe non effectuée. Contactez un agent.";
    } else {
      try {
        const result = aiAnalysis(
          await provider.analyze({
            title: ticket.title,
            description: ticket.description,
          }),
        );

        classification = result.classification;

        if (result.requiresHuman || result.classification === "NEEDS_REVIEW") {
          state = "NEEDS_REVIEW";

          reason =
            "Un agent doit vérifier la demande ou demander des précisions.";
        } else if (result.classification === "OFF_TOPIC") {
          state = "OFF_TOPIC";

          reason =
            "Demande classée hors du support informatique. Un agent peut corriger ce classement.";
        } else {
          state = "ANSWERED";

          answer = result.answer;

          reason =
            "Solution proposée par IA, à vérifier avant application. Confirmez le résultat après essai.";
        }
      } catch {
        // Erreur réseau, quota, refus ou JSON invalide : conserver le ticket pour le support.
      }
    }

    await db.$transaction(async (tx) => {
      // Un agent ayant modifié le statut pendant l'appel reste prioritaire.
      const updated = await tx.ticket.updateMany({
        where: {
          id,
          revision: ticket.revision,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
        data: { revision: { increment: 1 } },
      });
      const changes =
        updated.count === 1
          ? {
              state,
              classification,
              answer,
              reason,
              ticketRevision: ticket.revision + 1,
            }
          : {
              state: "NEEDS_REVIEW" as const,
              classification: null,
              answer: null,
              reason: "Analyse écartée : ticket modifié pendant le traitement.",
            };
      const saved = await tx.ticketAi.updateMany({
        where: { ticketId: id, attemptId, state: "PROCESSING" },
        data: changes,
      });

      if (saved.count === 1)
        await audit(
          tx,
          actor.id,
          id,
          "TICKET_AI_COMPLETED",
          "PROCESSING",
          changes.state,
        );
    });

    return db.ticket.findUniqueOrThrow({
      where: { id },
      include: { ai: true },
    });
  }

  async function feedback(
    value: string | string[],
    input: unknown,
    actor: TicketActor,
  ) {
    const id = ticketId(value);
    const body = objectBody(input, ["resolved"]);

    if (typeof body.resolved !== "boolean")
      throw new HttpError(400, "resolved doit être true ou false.");

    return db.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id, ...ticketVisibility(actor) },
        include: { ai: true },
      });

      if (!ticket) throw new HttpError(404, "Ticket introuvable.");

      if (ticket.ownerId !== actor.id)
        throw new HttpError(
          403,
          "Seul le propriétaire peut confirmer le résultat.",
        );

      if (
        !ticket.ai ||
        ticket.ai.state !== "ANSWERED" ||
        ticket.ai.ticketRevision !== ticket.revision ||
        !["OPEN", "IN_PROGRESS"].includes(ticket.status)
      )
        throw conflict();

      const status = body.resolved ? "RESOLVED" : "IN_PROGRESS";
      const updated = await tx.ticket.updateMany({
        where: { id, revision: ticket.revision },
        data: { status, revision: { increment: 1 } },
      });

      if (updated.count !== 1) throw conflict();

      await tx.ticketAi.update({
        where: { ticketId: id },
        data: {
          state: body.resolved ? "CONFIRMED" : "NEEDS_REVIEW",
          reason: body.resolved
            ? "Résolution confirmée par le propriétaire."
            : "La solution ne suffit pas : reprise humaine demandée.",
          ticketRevision: ticket.revision + 1,
        },
      });

      await audit(
        tx,
        actor.id,
        id,
        body.resolved ? "TICKET_AI_CONFIRMED" : "TICKET_AI_REJECTED",
        ticket.status,
        status,
      );

      return tx.ticket.findUniqueOrThrow({
        where: { id },
        include: { ai: true },
      });
    });
  }

  return { enabled: provider !== null, analyze, feedback };
}

export type TicketAiService = ReturnType<typeof ticketAiService>;
