import { Router } from 'express';
import type { PrismaClient } from './generated/prisma/client.js';
import { authenticate, lockUser, publicUser, requirePermission } from './auth.js';
import type { JwtService } from './jwt.js';
import { HttpError, objectBody, rateLimit } from './security.js';

export function accountStatusRouter(db: PrismaClient, jwt: JwtService) {
  const router = Router();
  router.patch('/:id/status', authenticate(db, jwt), requirePermission('users:manage-status'),
    rateLimit(30, 15 * 60 * 1000, req => req.ip ?? 'unknown'), async (req, res) => {
      const value = req.params.id;
      if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new HttpError(400, 'ID invalide.');
      const id = Number(value), body = objectBody(req.body);
      if (body.status !== 'ACTIVE' && body.status !== 'DISABLED') throw new HttpError(400, 'status doit être ACTIVE ou DISABLED.');
      const user = await db.$transaction(async tx => {
        // Sérialiser les changements de statut : deux requêtes ne doivent pas désactiver
        // simultanément les deux derniers super administrateurs.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(78234902)`;
        for (const userId of [...new Set([id, res.locals.user.id as number])].sort((a, b) => a - b)) {
          if (!await tx.user.findUnique({ where: { id: userId } })) throw new HttpError(404, 'Compte introuvable.');
          await lockUser(tx, userId);
        }
        const actor = await tx.user.findUniqueOrThrow({ where: { id: res.locals.user.id } });
        const session = await tx.session.findUnique({ where: { id: res.locals.sessionId } });
        if (actor.status !== 'ACTIVE' || actor.role !== 'SUPER_ADMIN' || !session || session.revokedAt || session.expiresAt <= new Date()) {
          throw new HttpError(403, 'Autorisation révoquée.');
        }
        const target = await tx.user.findUniqueOrThrow({ where: { id } });
        if (body.status === 'DISABLED' && target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' &&
            await tx.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } }) <= 1) {
          throw new HttpError(409, 'Impossible de désactiver le dernier Super Admin actif.');
        }
        if (body.status === 'ACTIVE' && target.status !== 'DISABLED') throw new HttpError(409, 'Seul un compte désactivé peut être réactivé.');
        // Un compte n'ayant jamais accepté son invitation doit encore choisir son mot de passe.
        const status = body.status === 'DISABLED' ? 'DISABLED' : target.passwordHash ? 'ACTIVE' : 'INVITED';
        const user = await tx.user.update({ where: { id }, data: { status }, select: publicUser });
        await tx.session.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });
        await tx.passwordReset.deleteMany({ where: { userId: id } });
        await tx.invitation.deleteMany({ where: { userId: id } });
        return user;
      });
      res.json({ user, message: user.status === 'INVITED' ? 'Compte réactivé en attente : renvoyez une invitation.' : 'Statut du compte mis à jour.' });
    });
  return router;
}
