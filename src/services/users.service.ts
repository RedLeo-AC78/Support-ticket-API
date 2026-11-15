import type { PrismaClient } from "../generated/prisma/client.js";

import {
  lockUser,
  publicUser,
  usersRepository,
} from "../repositories/users.repository.js";

import { HttpError, objectBody } from "../utils/security.js";

export function usersService(db: PrismaClient) {
  const repository = usersRepository(db);

  async function changeStatus(
    value: string | string[],
    input: unknown,
    actorId: number,
    sessionId: string,
  ) {
    if (
      typeof value !== "string" ||
      !/^[1-9]\d*$/.test(value) ||
      Number(value) > 2147483647
    )
      throw new HttpError(400, "ID invalide.");

    const id = Number(value),
      body = objectBody(input);

    if (body.status !== "ACTIVE" && body.status !== "DISABLED")
      throw new HttpError(400, "status doit être ACTIVE ou DISABLED.");

    const user = await db.$transaction(async (tx) => {
      // Sérialiser les changements de statut : deux requêtes ne doivent pas désactiver
      // simultanément les deux derniers super administrateurs.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(78234902)`;

      for (const userId of [...new Set([id, actorId])].sort((a, b) => a - b)) {
        if (!(await tx.user.findUnique({ where: { id: userId } })))
          throw new HttpError(404, "Compte introuvable.");

        await lockUser(tx, userId);
      }

      const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
      const session = await tx.session.findUnique({ where: { id: sessionId } });

      if (
        actor.status !== "ACTIVE" ||
        actor.role !== "SUPER_ADMIN" ||
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        throw new HttpError(403, "Autorisation révoquée.");
      }

      const target = await tx.user.findUniqueOrThrow({ where: { id } });

      if (
        body.status === "DISABLED" &&
        target.role === "SUPER_ADMIN" &&
        target.status === "ACTIVE" &&
        (await tx.user.count({
          where: { role: "SUPER_ADMIN", status: "ACTIVE" },
        })) <= 1
      ) {
        throw new HttpError(
          409,
          "Impossible de désactiver le dernier Super Admin actif.",
        );
      }

      if (body.status === "ACTIVE" && target.status !== "DISABLED")
        throw new HttpError(
          409,
          "Seul un compte désactivé peut être réactivé.",
        );

      // Un compte n'ayant jamais accepté son invitation doit encore choisir son mot de passe.
      const status =
        body.status === "DISABLED"
          ? "DISABLED"
          : target.passwordHash
            ? "ACTIVE"
            : "INVITED";
      const user = await tx.user.update({
        where: { id },
        data: { status },
        select: publicUser,
      });

      await tx.session.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });

      await tx.passwordReset.deleteMany({ where: { userId: id } });

      await tx.invitation.deleteMany({ where: { userId: id } });

      return user;
    });

    return {
      user,
      message:
        user.status === "INVITED"
          ? "Compte réactivé en attente : renvoyez une invitation."
          : "Statut du compte mis à jour.",
    };
  }

  return { list: repository.list, changeStatus };
}

export type UsersService = ReturnType<typeof usersService>;
