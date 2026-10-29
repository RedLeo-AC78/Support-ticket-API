import { Router } from 'express';
import type { PrismaClient } from './generated/prisma/client.js';
import { lockUser } from './auth.js';
import type { Mailer } from './mail.js';
import { digest, emailValue, hashPassword, HttpError, newToken, objectBody, passwordValue, rateLimit } from './security.js';

const invalid = () => new HttpError(400, 'Code de réinitialisation invalide, expiré ou déjà utilisé.');
export function passwordResetRouter(db: PrismaClient, mailer: Mailer) {
  const router = Router();
  const pending = new Set<Promise<void>>();
  // File en mémoire bornée ; les erreurs sont journalisées sans email, token ni secret.
  function enqueue(task: () => Promise<void>) {
    if (pending.size >= 20) throw new HttpError(503, 'Service temporairement occupé. Réessayez plus tard.');
    const job = new Promise<void>(resolve => setImmediate(() => {
      void task().catch(() => console.error('Échec du traitement email de réinitialisation.')).finally(resolve);
    }));
    pending.add(job);
    void job.finally(() => pending.delete(job));
  }
  const drain = async () => { while (pending.size) await Promise.all([...pending]); };
  let activeHashes = 0;
  router.post('/forgot-password',
    rateLimit(20, 15 * 60 * 1000, req => req.ip ?? 'unknown'),
    rateLimit(3, 60 * 60 * 1000, req => digest(String(req.body?.email ?? '').trim().toLowerCase())),
    (req, res) => {
      const email = emailValue(objectBody(req.body).email);
      enqueue(async () => {
        const found = await db.user.findUnique({ where: { email } });
        if (!found) return;
        const token = newToken(), hash = digest(token);
        const eligible = await db.$transaction(async tx => {
          await lockUser(tx, found.id);
          const user = await tx.user.findUniqueOrThrow({ where: { id: found.id } });
          if (user.status !== 'ACTIVE' || !user.passwordHash) return false;
          await tx.passwordReset.deleteMany({ where: { userId: user.id } });
          await tx.passwordReset.create({ data: { hash, userId: user.id, expiresAt: new Date(Date.now() + 20 * 60 * 1000) } });
          return true;
        });
        if (!eligible) return;
        try {
          await mailer({ to: email, subject: 'Réinitialisation de votre mot de passe Support Ticket', text:
            `Un changement de mot de passe a été demandé pour votre compte.\n\nCode valable 20 minutes, à usage unique :\n${token}\n\nEnvoyez ce code dans token avec newPassword et confirmPassword à POST /auth/reset-password.\nSi vous n'avez rien demandé, ignorez cet email : votre mot de passe reste inchangé. Ne partagez pas ce code.` });
        } catch {
          // Un échec ou timeout rend ce code inutilisable, même si le fournisseur le livre ensuite.
          await db.passwordReset.deleteMany({ where: { hash } });
          throw new Error('Envoi impossible.');
        }
      });
      // Aucune recherche de compte ni attente fournisseur avant la réponse HTTP.
      res.status(202).json({ message: 'Si ce compte est actif, un email de réinitialisation sera envoyé.' });
    });

  router.post('/reset-password', rateLimit(15, 15 * 60 * 1000, req => req.ip ?? 'unknown'), async (req, res) => {
    const body = objectBody(req.body);
    if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw invalid();
    const password = passwordValue(body.newPassword);
    if (password !== body.confirmPassword) throw new HttpError(400, 'Les mots de passe ne correspondent pas.');
    const hash = digest(body.token);
    const found = await db.passwordReset.findUnique({ where: { hash }, include: { user: true } });
    if (!found || found.expiresAt <= new Date() || found.user.status !== 'ACTIVE' || !found.user.passwordHash) throw invalid();
    if (activeHashes >= 2) throw new HttpError(429, 'Serveur occupé. Réessayez dans un instant.');
    activeHashes++;
    try {
      const passwordHash = await hashPassword(password);
      const user = await db.$transaction(async tx => {
        await lockUser(tx, found.userId);
        const current = await tx.passwordReset.findUnique({ where: { hash }, include: { user: true } });
        if (!current || current.expiresAt <= new Date() || current.user.status !== 'ACTIVE' || !current.user.passwordHash) throw invalid();
        const user = await tx.user.update({ where: { id: current.userId }, data: { passwordHash }, select: { email: true } });
        await tx.passwordReset.deleteMany({ where: { userId: current.userId } });
        await tx.session.updateMany({ where: { userId: current.userId }, data: { revokedAt: new Date() } });
        await tx.invitation.deleteMany({ where: { userId: current.userId } });
        return user;
      });
      // La notification est informative : son échec ne doit pas annuler un reset déjà validé.
      try {
        enqueue(async () => { await mailer({ to: user.email, subject: 'Votre mot de passe Support Ticket a été modifié', text:
          'Votre mot de passe a été modifié et toutes vos sessions ont été fermées. Reconnectez-vous avec votre nouveau mot de passe. Si vous n’êtes pas à l’origine de cette action, contactez le Super Admin.' }); });
      } catch { console.error('Notification de changement de mot de passe non planifiée.'); }
      res.json({ message: 'Mot de passe modifié. Reconnectez-vous.' });
    } finally { activeHashes--; }
  });
  return { router, drain };
}
