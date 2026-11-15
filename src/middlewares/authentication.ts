import type { RequestHandler } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";

import type { JwtService } from "../config/jwt.js";
import { hasPermission, type Permission } from "../config/permissions.js";

import { publicUser } from "../repositories/users.repository.js";

import { digest, HttpError } from "../utils/security.js";

const invalid = () => new HttpError(401, "Token invalide ou expiré.");

export function requirePermission(permission: Permission): RequestHandler {
  return (_req, res, next) => {
    if (!hasPermission(res.locals.user.role, permission))
      throw new HttpError(403, "Permission insuffisante.");

    next();
  };
}

export function authenticate(
  db: PrismaClient,
  jwt: JwtService,
): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "");

    if (!match || match[1].length > 2048) throw invalid();

    const claims = await jwt.verify(match[1]);
    const session = await db.session.findUnique({
      where: { id: claims.sessionId },
      include: { user: { select: publicUser } },
    });

    if (
      !session ||
      session.userId !== claims.userId ||
      session.accessHash !== digest(match[1]) ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.accessExpiresAt <= new Date() ||
      session.user.status !== "ACTIVE"
    )
      throw invalid();

    res.locals.user = session.user;

    res.locals.sessionId = session.id;

    next();
  };
}
