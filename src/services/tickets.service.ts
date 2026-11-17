import {
  ticketVisibility as visibility,
  type TicketActor as Actor,
} from "../config/ticket-access.js";

import type { TicketAiService } from "./ticket-ai.service.js";

import type { TicketsRepository } from "../repositories/tickets.repository.js";

import {
  createTicketInput,
  ticketId,
  ticketStatusInput,
} from "../validators/tickets.validation.js";

import { HttpError } from "../utils/security.js";

import { ticketListInput } from "../validators/list.validation.js";

export function ticketsService(
  repository: TicketsRepository,
  ai?: TicketAiService,
) {
  return {
    create: (input: unknown, actor: Actor) => {
      const created = repository.create({
        ...createTicketInput(input),
        ownerId: actor.id,
      });

      if (!ai?.enabled) return created;

      return created.then(async (ticket) => {
        try {
          return await ai.analyze(String(ticket.id), actor);
        } catch {
          // Le ticket est déjà créé : ne pas encourager une deuxième création sur erreur IA.
          console.error(
            "Traitement IA interrompu. Le ticket reste enregistré.",
          );

          return (
            (await repository.find(ticket.id, visibility(actor))) ?? ticket
          );
        }
      });
    },
    list: (actor: Actor, query: unknown = {}) =>
      repository.list(visibility(actor), ticketListInput(query)),
    async get(value: string | string[], actor: Actor) {
      const ticket = await repository.find(ticketId(value), visibility(actor));

      if (!ticket) throw new HttpError(404, "Ticket introuvable.");

      return ticket;
    },
    updateStatus: (
      value: string | string[],
      input: unknown,
      actor: Actor,
      sessionId: string,
    ) =>
      repository.updateStatus(
        ticketId(value),
        visibility(actor),
        ticketStatusInput(input),
        actor.id,
        sessionId,
      ),
  };
}

export type TicketsService = ReturnType<typeof ticketsService>;
