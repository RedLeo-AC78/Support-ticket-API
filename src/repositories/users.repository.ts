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
    list: () =>
      db.user.findMany({ select: publicUser, orderBy: { id: "asc" } }),
  };
}
