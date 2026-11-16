import type { Prisma, User } from "../generated/prisma/client.js";

export type TicketActor = Pick<User, "id" | "role">;

export function ticketVisibility(user: TicketActor): Prisma.TicketWhereInput {
  if (user.role === "USER") return { ownerId: user.id };

  if (user.role === "AGENT") return { ownerId: { not: null } };

  return {};
}
