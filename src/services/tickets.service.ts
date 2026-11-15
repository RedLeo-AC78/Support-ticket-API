import type { Prisma, User } from "../generated/prisma/client.js";

import type { TicketsRepository } from "../repositories/tickets.repository.js";

import {
  createTicketInput,
  ticketId,
  ticketStatusInput,
} from "../validators/tickets.validation.js";

import { HttpError } from "../utils/security.js";

import { ticketListInput } from "../validators/list.validation.js";

type Actor = Pick<User, "id" | "role">;

function visibility(user: Actor): Prisma.TicketWhereInput {
  if (user.role === "USER") return { ownerId: user.id };

  if (user.role === "AGENT") return { ownerId: { not: null } };

  return {};
}

export function ticketsService(repository: TicketsRepository) {
  return {
    create: (input: unknown, actor: Actor) =>
      repository.create({ ...createTicketInput(input), ownerId: actor.id }),
    list: (actor: Actor, query: unknown = {}) =>
      repository.list(visibility(actor), ticketListInput(query)),
    async get(value: string | string[], actor: Actor) {
      const ticket = await repository.find(ticketId(value), visibility(actor));

      if (!ticket) throw new HttpError(404, "Ticket introuvable.");

      return ticket;
    },
    updateStatus: (value: string | string[], input: unknown, actor: Actor) =>
      repository.updateStatus(
        ticketId(value),
        visibility(actor),
        ticketStatusInput(input),
      ),
  };
}

export type TicketsService = ReturnType<typeof ticketsService>;
