import type { PrismaClient, Prisma } from "../generated/prisma/client.js";

export const publicUser = {
  id: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

export async function lockUser(tx: Prisma.TransactionClient, id: number) {
  await tx.user.update({ where: { id }, data: { id }, select: { id: true } });
}

export function usersRepository(db: PrismaClient) {
  return {
    async list(page: number, limit: number) {
      const [data, total] = await db.$transaction(
        [
          db.user.findMany({
            select: publicUser,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: "asc" },
          }),
          db.user.count(),
        ],
        { isolationLevel: "RepeatableRead" },
      );

      return {
        data,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },
  };
}
