import express, { type ErrorRequestHandler } from 'express';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';
import { TicketStatus } from './generated/prisma/enums.js';

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Le corps doit être un objet JSON.');
  }
  return value as Record<string, unknown>;
}

function textField(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new HttpError(400, `${field} doit contenir entre 1 et ${max} caractères.`);
  }
  return value.trim();
}

function ticketId(value: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id) || id > 2147483647) {
    throw new HttpError(400, 'ID invalide : entier positif attendu.');
  }
  return id;
}

export function createApp(db: Pick<PrismaClient, 'ticket'>) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.post('/tickets', async (req, res) => {
    const body = objectBody(req.body);
    const title = textField(body.title, 'title', 150);
    const description = textField(body.description, 'description', 5000);
    const ticket = await db.ticket.create({ data: { title, description } });
    res.location(`/tickets/${ticket.id}`).status(201).json(ticket);
  });

  app.get('/tickets', async (_req, res) => {
    res.json(await db.ticket.findMany({ orderBy: { id: 'desc' } }));
  });

  app.get('/tickets/:id', async (req, res) => {
    const ticket = await db.ticket.findUnique({ where: { id: ticketId(req.params.id) } });
    if (!ticket) throw new HttpError(404, 'Ticket introuvable.');
    res.json(ticket);
  });

  app.patch('/tickets/:id/status', async (req, res) => {
    const id = ticketId(req.params.id);
    const body = objectBody(req.body);
    if (typeof body.status !== 'string' || !Object.values(TicketStatus).includes(body.status as TicketStatus)) {
      throw new HttpError(400, 'status doit être OPEN, IN_PROGRESS, RESOLVED ou CLOSED.');
    }
    res.json(await db.ticket.update({ where: { id }, data: { status: body.status as TicketStatus } }));
  });

  app.use((_req, _res, next) => next(new HttpError(404, 'Route introuvable.')));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
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
