import { HttpError, objectBody } from "../utils/security.js";

import { TicketStatus, AiState } from "../generated/prisma/enums.js";

export function pagination(input: Record<string, unknown>) {
  function integer(key: string, fallback: number, max: number) {
    const value = input[key];

    if (value === undefined) return fallback;

    if (
      typeof value !== "string" ||
      !/^[1-9]\d*$/.test(value) ||
      Number(value) > max
    )
      throw new HttpError(400, `${key} doit être un entier entre 1 et ${max}.`);

    return Number(value);
  }

  return { page: integer("page", 1, 100000), limit: integer("limit", 20, 100) };
}

export function ticketListInput(value: unknown = {}) {
  const query = objectBody(value);

  if (
    Object.keys(query).some(
      (key) =>
        ![
          "page",
          "limit",
          "status",
          "search",
          "sortBy",
          "order",
          "aiState",
        ].includes(key),
    )
  )
    throw new HttpError(400, "Paramètre de recherche inconnu.");

  const { page, limit } = pagination(query);
  const sortBy = query.sortBy ?? "id";
  const order = query.order ?? "desc";

  if (
    query.aiState !== undefined &&
    (typeof query.aiState !== "string" ||
      !Object.values(AiState).includes(query.aiState as AiState))
  )
    throw new HttpError(400, "État IA invalide.");

  if (
    !["id", "createdAt", "updatedAt", "title", "status"].includes(
      String(sortBy),
    ) ||
    typeof sortBy !== "string"
  )
    throw new HttpError(400, "Champ de tri invalide.");

  if (order !== "asc" && order !== "desc")
    throw new HttpError(400, "order doit être asc ou desc.");

  if (
    query.status !== undefined &&
    (typeof query.status !== "string" ||
      !Object.values(TicketStatus).includes(query.status as TicketStatus))
  )
    throw new HttpError(400, "Statut de filtre invalide.");

  if (
    query.search !== undefined &&
    (typeof query.search !== "string" ||
      !query.search.trim() ||
      query.search.length > 150)
  )
    throw new HttpError(400, "search doit contenir 1 à 150 caractères.");

  return {
    page,
    limit,
    sortBy,
    order: order as "asc" | "desc",
    status: query.status as TicketStatus | undefined,
    aiState: query.aiState as AiState | undefined,
    search: (query.search as string | undefined)?.trim(),
  };
}

export type TicketListInput = ReturnType<typeof ticketListInput>;
