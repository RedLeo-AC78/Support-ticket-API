import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Objet JSON attendu.');
  return value as Record<string, unknown>;
}
export function emailValue(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new HttpError(400, 'Adresse email invalide.');
  }
  return value.trim().toLowerCase();
}
export function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || [...value].length < 15 || [...value].length > 128) {
    throw new HttpError(400, 'Le mot de passe doit contenir 15 à 128 caractères.');
  }
  return value; // Ne jamais supprimer les espaces d'un mot de passe.
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64,
    { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, hash] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, 'hex'));
}
export const newToken = () => randomBytes(32).toString('base64url');
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export function tokenValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new HttpError(401, 'Token invalide ou expiré.');
  return value;
}

// Limiteur borné en mémoire, pour une seule instance Node. Pas de confiance dans X-Forwarded-For.
export function rateLimit(limit: number, windowMs: number, key: (req: Parameters<RequestHandler>[0]) => string): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [id, entry] of entries) if (entry.until <= now) entries.delete(id);
    const id = key(req);
    const entry = entries.get(id) ?? { count: 0, until: now + windowMs };
    if (!entries.has(id) && entries.size >= 10000 || ++entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      next(new HttpError(429, 'Trop de tentatives. Réessayez plus tard.')); return;
    }
    entries.set(id, entry); next();
  };
}
