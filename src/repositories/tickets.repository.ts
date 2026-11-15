import type { PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";

import type { TicketListInput } from "../validators/list.validation.js";

export function ticketsRepository(db: PrismaClient) {
  return {
    create: (data: { title: string; description: string; ownerId: number }) =>
      db.ticket.create({ data }),
    async list(scope: Prisma.TicketWhereInput, options: TicketListInput) {
      const { page, limit, sortBy, order, status, search } = options;
      // AND conserve toujours le périmètre d'accès, quels que soient les filtres.
      const where: Prisma.TicketWhereInput = {
        AND: [
          scope,
          {
            ...(status ? { status } : {}),
            ...(search
              ? {
                  OR: [
                    {
                      title: { contains: search, mode: "insensitive" as const },
                    },
                    {
                      description: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                }
              : {}),
          },
        ],
      };
      const [data, total] = await db.$transaction(
        [
          db.ticket.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy:
              sortBy === "id"
                ? [{ id: order }]
                : [{ [sortBy]: order }, { id: order }],
          }),
          db.ticket.count({ where }),
        ],
        { isolationLevel: "RepeatableRead" },
      );

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },
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
