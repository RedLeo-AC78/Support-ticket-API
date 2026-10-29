import { Router } from 'express';
import type { PrismaClient } from './generated/prisma/client.js';
import { Role } from './generated/prisma/enums.js';
import { authenticate, lockUser, publicUser, requirePermission } from './auth.js';
import type { JwtService } from './jwt.js';
import type { Mailer } from './mail.js';
import { digest, emailValue, hashPassword, HttpError, newToken, objectBody, passwordValue, rateLimit } from './security.js';

const invitationMs = 24 * 60 * 60 * 1000;
const invalid = () => new HttpError(400, 'Invitation invalide, expirée ou déjà utilisée.');
function idValue(value: string | string[]): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new HttpError(400, 'ID invalide.');
  return Number(value);
}
async function deliver(mailer: Mailer, email: string, token: string) {
  try {
    return await mailer({ to: email, subject: 'Votre invitation à Support Ticket', text:
      `Vous avez été invité à rejoindre Support Ticket.\n\nCode d'invitation (valable 24 heures et utilisable une seule fois) :\n${token}\n\nPour accepter, envoyez ce code dans le champ token de POST /auth/accept-invitation, avec password et confirmPassword (15 à 128 caractères). Le rôle est déjà défini par le super administrateur.\n\nNe partagez pas ce code. Si vous n'attendiez pas cette invitation, ignorez ce message. Aucun mot de passe ne vous sera demandé par email.` });
  } catch {
    // Le compte existe déjà : signaler l'échec et permettre un renvoi explicite.
    return { status: 'failed' as const };
  }
}

export function usersInvitationRouter(db: PrismaClient, jwt: JwtService, mailer: Mailer) {
  const router = Router();
  router.use(authenticate(db, jwt), requirePermission('users:invite'));
  router.use(rateLimit(20, 60 * 60 * 1000, req => req.ip ?? 'unknown'));
  router.post('/', async (req, res) => {
    const body = objectBody(req.body), email = emailValue(body.email);
    const role = body.role ?? 'USER';
    if (typeof role !== 'string' || !Object.values(Role).includes(role as Role)) throw new HttpError(400, 'Rôle attendu : USER, AGENT, ADMIN ou SUPER_ADMIN.');
    if ('password' in body || 'passwordHash' in body || 'status' in body) throw new HttpError(400, 'Le destinataire doit choisir son mot de passe via l’invitation.');
    const token = newToken();
    const user = await db.user.create({ data: {
      email, role: role as Role, status: 'INVITED',
      invitations: { create: { hash: digest(token), expiresAt: new Date(Date.now() + invitationMs) } },
    }, select: publicUser });
    const delivery = await deliver(mailer, user.email, token);
    // 201 : le compte est créé même si le fournisseur refuse l'email.
    res.status(201).json({ user, invitation: delivery });
  });

  router.post('/:id/invitation', async (req, res) => {
    const id = idValue(req.params.id), token = newToken();
    const user = await db.$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { id } });
      if (!existing) throw new HttpError(404, 'Compte introuvable.');
      await lockUser(tx, id);
      const current = await tx.user.findUniqueOrThrow({ where: { id }, select: publicUser });
      if (current.status !== 'INVITED') throw new HttpError(409, 'Seul un compte en attente peut recevoir une invitation.');
      await tx.invitation.deleteMany({ where: { userId: id } });
      await tx.invitation.create({ data: { hash: digest(token), userId: id, expiresAt: new Date(Date.now() + invitationMs) } });
      return current;
    });
    const delivery = await deliver(mailer, user.email, token);
    res.json({ user, invitation: delivery });
  });
  return router;
}

export function acceptInvitationRouter(db: PrismaClient) {
  const router = Router();
  let activeHashes = 0;
  router.post('/accept-invitation', rateLimit(15, 15 * 60 * 1000, req => req.ip ?? 'unknown'), async (req, res) => {
    const body = objectBody(req.body);
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw invalid();
    if ('role' in body || 'email' in body || 'status' in body) throw new HttpError(400, 'Le compte et son rôle sont définis par l’invitation.');
    const password = passwordValue(body.password);
    if (password !== body.confirmPassword) throw new HttpError(400, 'Les mots de passe ne correspondent pas.');
    const hash = digest(body.token);
    const invitation = await db.invitation.findUnique({ where: { hash }, include: { user: true } });
    if (!invitation || invitation.expiresAt <= new Date() || invitation.user.status !== 'INVITED') throw invalid();
    if (activeHashes >= 2) throw new HttpError(429, 'Serveur occupé. Réessayez dans un instant.');
    activeHashes++;
    try {
      const passwordHash = await hashPassword(password);
      const user = await db.$transaction(async tx => {
        await lockUser(tx, invitation.userId);
        const current = await tx.invitation.findUnique({ where: { hash }, include: { user: true } });
        if (!current || current.expiresAt <= new Date() || current.user.status !== 'INVITED') throw invalid();
        const user = await tx.user.update({ where: { id: current.userId }, data: { passwordHash, status: 'ACTIVE' }, select: publicUser });
        await tx.invitation.deleteMany({ where: { userId: user.id } });
        await tx.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
        return user;
      });
      res.json({ user, message: 'Invitation acceptée. Vous pouvez maintenant vous connecter.' });
    } finally { activeHashes--; }
  });
  return router;
}
