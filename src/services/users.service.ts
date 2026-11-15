import type { PrismaClient } from "../generated/prisma/client.js";

import {
  lockUser,
  publicUser,
  usersRepository,
} from "../repositories/users.repository.js";

import { HttpError, objectBody } from "../utils/security.js";

import { Role } from "../generated/prisma/enums.js";

import { pagination } from "../validators/list.validation.js";

export function usersService(db: PrismaClient) {
  const repository = usersRepository(db);

  async function changeAccount(
    value: string | string[],
    input: unknown,
    actorId: number,
    sessionId: string,
    field: "role" | "status",
  ) {
    if (
      typeof value !== "string" ||
      !/^[1-9]\d*$/.test(value) ||
      Number(value) > 2147483647
    )
      throw new HttpError(400, "ID invalide.");

    const id = Number(value),
      body = objectBody(input);

    if (Object.keys(body).some((key) => key !== field))
      throw new HttpError(400, "Champ inconnu.");

    if (
      field === "role" &&
      (typeof body.role !== "string" ||
        !Object.values(Role).includes(body.role as Role))
    )
      throw new HttpError(400, "Rôle invalide.");

    if (
      field === "status" &&
      body.status !== "ACTIVE" &&
      body.status !== "DISABLED"
    )
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
        session.userId !== actorId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        throw new HttpError(403, "Autorisation révoquée.");
      }

      const target = await tx.user.findUniqueOrThrow({ where: { id } });

      if (
        (body.status === "DISABLED" ||
          (field === "role" && body.role !== "SUPER_ADMIN")) &&
        target.role === "SUPER_ADMIN" &&
        target.status === "ACTIVE" &&
        (await tx.user.count({
          where: { role: "SUPER_ADMIN", status: "ACTIVE" },
        })) <= 1
      ) {
        throw new HttpError(
          409,
          "Impossible de désactiver ou rétrograder le dernier Super Admin actif.",
        );
      }

      if (
        field === "status" &&
        body.status === "ACTIVE" &&
        target.status !== "DISABLED"
      )
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
        data: field === "status" ? { status } : { role: body.role as Role },
        select: publicUser,
      });

      await tx.session.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });

      await tx.passwordReset.deleteMany({ where: { userId: id } });

      await tx.invitation.deleteMany({ where: { userId: id } });

      // Même transaction : aucune modification sensible sans sa trace d'audit.
      await tx.auditLog.create({
        data: {
          actorId,
          targetId: id,
          action:
            field === "role" ? "USER_ROLE_CHANGED" : "USER_STATUS_CHANGED",
          before: target[field],
          after: user[field],
        },
      });

      return user;
    });

    return {
      user,
      message:
        field === "role"
          ? "Rôle modifié. Sessions révoquées ; renvoyez une invitation si le compte est en attente."
          : user.status === "INVITED"
            ? "Compte réactivé en attente : renvoyez une invitation."
            : "Statut du compte mis à jour.",
    };
  }

  async function audit(query: unknown) {
    const input = objectBody(query);

    if (Object.keys(input).some((key) => !["page", "limit"].includes(key)))
      throw new HttpError(400, "Paramètre inconnu.");

    const { page, limit } = pagination(input);
    const [data, total] = await db.$transaction(
      [
        db.auditLog.findMany({
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { id: "desc" },
        }),
        db.auditLog.count(),
      ],
      { isolationLevel: "RepeatableRead" },
    );

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  return {
    list: (query: unknown) => {
      const input = objectBody(query);

      if (Object.keys(input).some((key) => !["page", "limit"].includes(key)))
        throw new HttpError(400, "Paramètre inconnu.");

      const { page, limit } = pagination(input);

      return repository.list(page, limit);
    },
    audit,
    changeStatus: (
      id: string | string[],
      input: unknown,
      actorId: number,
      sessionId: string,
    ) => changeAccount(id, input, actorId, sessionId, "status"),
    changeRole: (
      id: string | string[],
      input: unknown,
      actorId: number,
      sessionId: string,
    ) => changeAccount(id, input, actorId, sessionId, "role"),
  };
}

export type UsersService = ReturnType<typeof usersService>;
