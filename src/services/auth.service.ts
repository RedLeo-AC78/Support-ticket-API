import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../generated/prisma/client.js";

import {
  digest,
  emailValue,
  HttpError,
  newToken,
  objectBody,
  passwordValue,
  tokenValue,
  verifyPassword,
} from "../utils/security.js";

import { ACCESS_SECONDS, type JwtService } from "../config/jwt.js";

import { lockUser } from "../repositories/users.repository.js";

const invalid = () => new HttpError(401, "Token invalide ou expiré.");

const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export function authService(db: PrismaClient, jwt: JwtService) {
  let activeLogins = 0;

  async function login(input: unknown) {
    const body = objectBody(input),
      email = emailValue(body.email),
      password = passwordValue(body.password);

    // Deux calculs scrypt au maximum, pour borner la consommation mémoire de cette instance.
    if (activeLogins >= 2)
      throw new HttpError(429, "Serveur occupé. Réessayez dans un instant.");

    activeLogins++;

    try {
      const user = await db.user.findUnique({ where: { email } });
      const valid = await verifyPassword(
        password,
        user?.passwordHash ?? dummyHash,
      );

      if (!user || !valid || user.status !== "ACTIVE")
        throw new HttpError(401, "Email ou mot de passe incorrect.");

      const sessionId = randomUUID(),
        refreshToken = newToken();
      const accessExpiresAt = new Date(Date.now() + ACCESS_SECONDS * 1000);
      const accessToken = await jwt.sign(user.id, sessionId, accessExpiresAt);

      await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);

        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });

        if (
          current.status !== "ACTIVE" ||
          current.passwordHash !== user.passwordHash
        )
          throw invalid();

        await tx.session.create({
          data: {
            id: sessionId,
            userId: user.id,
            accessHash: digest(accessToken),
            accessExpiresAt,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            refreshTokens: { create: { hash: digest(refreshToken) } },
          },
        });
      });

      return {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: ACCESS_SECONDS,
      };
    } finally {
      activeLogins--;
    }
  }

  async function refresh(input: unknown) {
    const hash = digest(tokenValue(objectBody(input).refreshToken));
    const found = await db.refreshToken.findUnique({
      where: { hash },
      include: { session: true },
    });

    if (!found) throw invalid();

    const result = await db.$transaction(async (tx) => {
      await lockUser(tx, found.session.userId);

      const current = await tx.refreshToken.findUniqueOrThrow({
        where: { hash },
        include: { session: { include: { user: true } } },
      });
      const session = current.session;

      if (
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== "ACTIVE"
      )
        return null;

      if (current.usedAt) {
        await tx.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });

        return null; // Commit de la révocation AVANT de renvoyer 401.
      }

      const refreshToken = newToken();
      const accessExpiresAt = new Date(
        Math.min(
          Date.now() + ACCESS_SECONDS * 1000,
          session.expiresAt.getTime(),
        ),
      );
      const accessToken = await jwt.sign(
        session.userId,
        session.id,
        accessExpiresAt,
      );

      await tx.refreshToken.update({
        where: { hash },
        data: { usedAt: new Date() },
      });

      await tx.session.update({
        where: { id: session.id },
        data: {
          accessHash: digest(accessToken),
          accessExpiresAt,
          refreshTokens: { create: { hash: digest(refreshToken) } },
        },
      });

      return {
        accessToken,
        refreshToken,
        tokenType: "Bearer",
        expiresIn: Math.max(
          0,
          Math.floor((accessExpiresAt.getTime() - Date.now()) / 1000),
        ),
      };
    });

    if (!result) throw invalid();

    return result;
  }

  async function logout(input: unknown) {
    const hash = digest(tokenValue(objectBody(input).refreshToken));
    const token = await db.refreshToken.findUnique({
      where: { hash },
      include: { session: true },
    });

    if (token)
      await db.$transaction(async (tx) => {
        await lockUser(tx, token.session.userId);

        await tx.session.update({
          where: { id: token.sessionId },
          data: { revokedAt: new Date() },
        });
      });
  }

  return { login, refresh, logout };
}

export type AuthService = ReturnType<typeof authService>;
