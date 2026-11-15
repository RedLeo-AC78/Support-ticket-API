import { TicketStatus } from "../generated/prisma/enums.js";

import { HttpError, objectBody } from "../utils/security.js";

function text(value: unknown, field: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new HttpError(
      400,
      `${field} doit contenir entre 1 et ${max} caractères.`,
    );

  return value.trim();
}

export function ticketId(value: string | string[]) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483647
  )
    throw new HttpError(400, "ID invalide : entier positif attendu.");

  return Number(value);
}

export function createTicketInput(value: unknown) {
  const body = objectBody(value);

  return {
    title: text(body.title, "title", 150),
    description: text(body.description, "description", 5000),
  };
}

export function ticketStatusInput(value: unknown): TicketStatus {
  const body = objectBody(value);

  if (
    typeof body.status !== "string" ||
    !Object.values(TicketStatus).includes(body.status as TicketStatus)
  )
    throw new HttpError(
      400,
      "status doit être OPEN, IN_PROGRESS, RESOLVED ou CLOSED.",
    );

  return body.status as TicketStatus;
}
