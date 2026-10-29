import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { PrismaClient, Prisma, User } from './generated/prisma/client.js';
import { digest, emailValue, HttpError, newToken, objectBody, passwordValue, rateLimit, tokenValue, verifyPassword } from './security.js';
import { ACCESS_SECONDS, type JwtService } from './jwt.js';
import { hasPermission, type Permission } from './permissions.js';

export const publicUser = { id: true, email: true, role: true, status: true, createdAt: true } as const;
const invalid = () => new HttpError(401, 'Token invalide ou expiré.');
const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function lockUser(tx: Prisma.TransactionClient, id: number) {
  await tx.user.update({ where: { id }, data: { id }, select: { id: true } });
}
export function ticketScope(user: Pick<User, 'id' | 'role'>): Prisma.TicketWhereInput {
  if (user.role === 'USER') return { ownerId: user.id };
  if (user.role === 'AGENT') return { ownerId: { not: null } };
  return {};
}
export function requirePermission(permission: Permission): RequestHandler {
  return (_req, res, next) => {
    if (!hasPermission(res.locals.user.role, permission)) throw new HttpError(403, 'Permission insuffisante.');
    next();
  };
}
export function authenticate(db: PrismaClient, jwt: JwtService): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match || match[1].length > 2048) throw invalid();
    const claims = await jwt.verify(match[1]);
    const session = await db.session.findUnique({ where: { id: claims.sessionId }, include: { user: { select: publicUser } } });
    if (!session || session.userId !== claims.userId || session.accessHash !== digest(match[1]) ||
        session.revokedAt || session.expiresAt <= new Date() || session.accessExpiresAt <= new Date() || session.user.status !== 'ACTIVE') throw invalid();
    res.locals.user = session.user;
    next();
  };
}
export function authRouter(db: PrismaClient, jwt: JwtService) {
  const router = Router();
  const byIp = rateLimit(30, 15 * 60 * 1000, req => req.ip ?? 'unknown');
  let activeLogins = 0;
  router.post('/login', byIp,
    rateLimit(10, 15 * 60 * 1000, req => digest(String(req.body?.email ?? '').trim().toLowerCase())),
    async (req, res) => {
      const body = objectBody(req.body), email = emailValue(body.email), password = passwordValue(body.password);
      // Deux calculs scrypt au maximum, pour borner la consommation mémoire de cette instance.
      if (activeLogins >= 2) throw new HttpError(429, 'Serveur occupé. Réessayez dans un instant.');
      activeLogins++;
      try {
        const user = await db.user.findUnique({ where: { email } });
        const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
        if (!user || !valid || user.status !== 'ACTIVE') throw new HttpError(401, 'Email ou mot de passe incorrect.');
        const sessionId = randomUUID(), refreshToken = newToken();
        const accessExpiresAt = new Date(Date.now() + ACCESS_SECONDS * 1000);
        const accessToken = await jwt.sign(user.id, sessionId, accessExpiresAt);
        await db.$transaction(async tx => {
          await lockUser(tx, user.id);
          const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
          if (current.status !== 'ACTIVE' || current.passwordHash !== user.passwordHash) throw invalid();
          await tx.session.create({ data: {
            id: sessionId, userId: user.id, accessHash: digest(accessToken), accessExpiresAt,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            refreshTokens: { create: { hash: digest(refreshToken) } },
          } });
        });
        res.json({ accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_SECONDS });
      } finally { activeLogins--; }
    });
  router.post('/refresh', byIp, async (req, res) => {
    const hash = digest(tokenValue(objectBody(req.body).refreshToken));
    const found = await db.refreshToken.findUnique({ where: { hash }, include: { session: true } });
    if (!found) throw invalid();
    const result = await db.$transaction(async tx => {
      await lockUser(tx, found.session.userId);
      const current = await tx.refreshToken.findUniqueOrThrow({ where: { hash }, include: { session: { include: { user: true } } } });
      const session = current.session;
      if (session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') return null;
      if (current.usedAt) {
        await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        return null; // Commit de la révocation AVANT de renvoyer 401.
      }
      const refreshToken = newToken();
      const accessExpiresAt = new Date(Math.min(Date.now() + ACCESS_SECONDS * 1000, session.expiresAt.getTime()));
      const accessToken = await jwt.sign(session.userId, session.id, accessExpiresAt);
      await tx.refreshToken.update({ where: { hash }, data: { usedAt: new Date() } });
      await tx.session.update({ where: { id: session.id }, data: {
        accessHash: digest(accessToken), accessExpiresAt,
        refreshTokens: { create: { hash: digest(refreshToken) } },
      } });
      return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: Math.max(0, Math.floor((accessExpiresAt.getTime() - Date.now()) / 1000)) };
    });
    if (!result) throw invalid();
    res.json(result);
  });
  router.post('/logout', byIp, async (req, res) => {
    const hash = digest(tokenValue(objectBody(req.body).refreshToken));
    const token = await db.refreshToken.findUnique({ where: { hash }, include: { session: true } });
    if (token) await db.$transaction(async tx => {
      await lockUser(tx, token.session.userId);
      await tx.session.update({ where: { id: token.sessionId }, data: { revokedAt: new Date() } });
    });
    res.status(204).end();
  });
  router.get('/me', authenticate(db, jwt), (_req, res) => res.json(res.locals.user));
  return router;
}
