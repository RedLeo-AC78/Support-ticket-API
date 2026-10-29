import express, { type ErrorRequestHandler } from 'express';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';
import { TicketStatus } from './generated/prisma/enums.js';
import { HttpError, objectBody } from './security.js';
import { authenticate, authRouter, requirePermission, ticketScope, publicUser } from './auth.js';
import { jwtService } from './jwt.js';
import { createMailer, type Mailer } from './mail.js';
import { acceptInvitationRouter, usersInvitationRouter } from './invitations.js';

function textField(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, `${field} doit contenir entre 1 et ${max} caractères.`);
  }
  return value.trim();
}

function ticketId(value: string | string[]): number {
  if (typeof value !== 'string') throw new HttpError(400, 'ID invalide.');
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id) || id > 2147483647) {
    throw new HttpError(400, 'ID invalide : entier positif attendu.');
  }
  return id;
}

export function createApp(db: PrismaClient, secret = process.env.JWT_SECRET, mailer: Mailer = createMailer()) {
  const jwt = jwtService(secret);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use('/auth', authRouter(db, jwt));
  app.use('/auth', acceptInvitationRouter(db));
  app.use('/tickets', authenticate(db, jwt));
  app.get('/users', authenticate(db, jwt), requirePermission('users:list'), async (_req, res) => {
    res.json(await db.user.findMany({ select: publicUser, orderBy: { id: 'asc' } }));
  });
  app.use('/users', usersInvitationRouter(db, jwt, mailer));

  app.post('/tickets', requirePermission('tickets:create'), async (req, res) => {
    const body = objectBody(req.body);
    const title = textField(body.title, 'title', 150);
    const description = textField(body.description, 'description', 5000);
    const ticket = await db.ticket.create({ data: { title, description, ownerId: res.locals.user.id } });
    res.location(`/tickets/${ticket.id}`).status(201).json(ticket);
  });

  app.get('/tickets', async (_req, res) => {
    res.json(await db.ticket.findMany({ where: ticketScope(res.locals.user), orderBy: { id: 'desc' } }));
  });

  app.get('/tickets/:id', async (req, res) => {
    const ticket = await db.ticket.findFirst({ where: { id: ticketId(req.params.id), ...ticketScope(res.locals.user) } });
    if (!ticket) throw new HttpError(404, 'Ticket introuvable.');
    res.json(ticket);
  });

  app.patch('/tickets/:id/status', requirePermission('tickets:update-status'), async (req, res) => {
    const id = ticketId(req.params.id);
    const body = objectBody(req.body);
    if (typeof body.status !== 'string' || !Object.values(TicketStatus).includes(body.status as TicketStatus)) {
      throw new HttpError(400, 'status doit être OPEN, IN_PROGRESS, RESOLVED ou CLOSED.');
    }
    res.json(await db.ticket.update({ where: { ...ticketScope(res.locals.user), id }, data: { status: body.status as TicketStatus } }));
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'Route introuvable.')));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Cette adresse email est déjà utilisée.' });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Ticket introuvable.' });
    } else if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON invalide.' });
    } else if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Corps de requête trop volumineux.' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
  };
  app.use(errorHandler);
  return app;
}
