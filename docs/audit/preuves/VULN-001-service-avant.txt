import type { PrismaClient } from "../generated/prisma/client.js";
import { Role } from "../generated/prisma/enums.js";

import { lockUser, publicUser } from "../repositories/users.repository.js";

import type { Mailer } from "./mail.service.js";

import {
  digest,
  emailValue,
  hashPassword,
  HttpError,
  newToken,
  objectBody,
  passwordValue,
} from "../utils/security.js";

const invitationMs = 24 * 60 * 60 * 1000;

const invalid = () =>
  new HttpError(400, "Invitation invalide, expirée ou déjà utilisée.");

function idValue(value: string | string[]): number {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > 2147483647
  )
    throw new HttpError(400, "ID invalide.");

  return Number(value);
}

async function deliver(mailer: Mailer, email: string, token: string) {
  try {
    return await mailer({
      to: email,
      subject: "Votre invitation à Support Ticket",
      text: `Vous avez été invité à rejoindre Support Ticket.\n\nCode d'invitation (valable 24 heures et utilisable une seule fois) :\n${token}\n\nPour accepter, envoyez ce code dans le champ token de POST /auth/accept-invitation, avec password et confirmPassword (15 à 128 caractères). Le rôle est déjà défini par le super administrateur.\n\nNe partagez pas ce code. Si vous n'attendiez pas cette invitation, ignorez ce message. Aucun mot de passe ne vous sera demandé par email.`,
    });
  } catch {
    // Le compte existe déjà : signaler l'échec et permettre un renvoi explicite.
    return { status: "failed" as const };
  }
}

export function invitationsService(db: PrismaClient, mailer: Mailer) {
  let activeHashes = 0;

  async function create(input: unknown, actorId: number) {
    const body = objectBody(input, ["email", "role"]),
      email = emailValue(body.email);
    const role = body.role === undefined ? "USER" : body.role;

    if (typeof role !== "string" || !Object.values(Role).includes(role as Role))
      throw new HttpError(
        400,
        "Rôle attendu : USER, AGENT, ADMIN ou SUPER_ADMIN.",
      );

    const token = newToken();
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          role: role as Role,
          status: "INVITED",
          invitations: {
            create: {
              hash: digest(token),
              expiresAt: new Date(Date.now() + invitationMs),
            },
          },
        },
        select: publicUser,
      });

      await tx.auditLog.create({
        data: {
          actorId,
          targetId: created.id,
          action: "USER_INVITED",
          after: created.role,
        },
      });

      return created;
    });
    const delivery = await deliver(mailer, user.email, token);

    // 201 : le compte est créé même si le fournisseur refuse l'email.
    return { user, invitation: delivery };
  }

  async function resend(value: string | string[], actorId: number) {
    const id = idValue(value),
      token = newToken();
    const user = await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id } });

      if (!existing) throw new HttpError(404, "Compte introuvable.");

      await lockUser(tx, id);

      const current = await tx.user.findUniqueOrThrow({
        where: { id },
        select: publicUser,
      });

      if (current.status !== "INVITED")
        throw new HttpError(
          409,
          "Seul un compte en attente peut recevoir une invitation.",
        );

      await tx.invitation.deleteMany({ where: { userId: id } });

      await tx.invitation.create({
        data: {
          hash: digest(token),
          userId: id,
          expiresAt: new Date(Date.now() + invitationMs),
        },
      });

      await tx.auditLog.create({
        data: { actorId, targetId: id, action: "INVITATION_REISSUED" },
      });

      return current;
    });
    const delivery = await deliver(mailer, user.email, token);

    return { user, invitation: delivery };
  }

  async function accept(input: unknown) {
    const body = objectBody(input, ["token", "password", "confirmPassword"]);

    if (
      typeof body.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.token)
    )
      throw invalid();

    const password = passwordValue(body.password);

    if (password !== body.confirmPassword)
      throw new HttpError(400, "Les mots de passe ne correspondent pas.");

    const hash = digest(body.token);
    const invitation = await db.invitation.findUnique({
      where: { hash },
      include: { user: true },
    });

    if (
      !invitation ||
      invitation.expiresAt <= new Date() ||
      invitation.user.status !== "INVITED"
    )
      throw invalid();

    if (activeHashes >= 2)
      throw new HttpError(429, "Serveur occupé. Réessayez dans un instant.");

    activeHashes++;

    try {
      const passwordHash = await hashPassword(password);
      const user = await db.$transaction(async (tx) => {
        await lockUser(tx, invitation.userId);

        const current = await tx.invitation.findUnique({
          where: { hash },
          include: { user: true },
        });

        if (
          !current ||
          current.expiresAt <= new Date() ||
          current.user.status !== "INVITED"
        )
          throw invalid();

        const user = await tx.user.update({
          where: { id: current.userId },
          data: { passwordHash, status: "ACTIVE" },
          select: publicUser,
        });

        await tx.invitation.deleteMany({ where: { userId: user.id } });

        await tx.session.updateMany({
          where: { userId: user.id },
          data: { revokedAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            targetId: user.id,
            action: "INVITATION_ACCEPTED",
            before: "INVITED",
            after: "ACTIVE",
          },
        });

        return user;
      });

      return {
        user,
        message: "Invitation acceptée. Vous pouvez maintenant vous connecter.",
      };
    } finally {
      activeHashes--;
    }
  }

  return { create, resend, accept };
}

export type InvitationsService = ReturnType<typeof invitationsService>;
