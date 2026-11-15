import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";

export function ticketsRepository(db: PrismaClient) {
  return {
    create: (data: { title: string; description: string; ownerId: number }) =>
      db.ticket.create({ data }),
    list: (where: Prisma.TicketWhereInput) =>
      db.ticket.findMany({ where, orderBy: { id: "desc" } }),
    find: (id: number, scope: Prisma.TicketWhereInput) =>
      db.ticket.findFirst({ where: { ...scope, id } }),
    updateStatus: (
      id: number,
      scope: Prisma.TicketWhereInput,
      status: TicketStatus,
    ) => db.ticket.update({ where: { ...scope, id }, data: { status } }),
  };
}

export type TicketsRepository = ReturnType<typeof ticketsRepository>;
