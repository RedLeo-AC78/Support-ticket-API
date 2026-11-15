import type { RequestHandler } from "express";

import { HttpError } from "../utils/security.js";

// Limiteur borné en mémoire, pour une seule instance Node. Pas de confiance dans X-Forwarded-For.
export function rateLimit(
  limit: number,
  windowMs: number,
  key: (req: Parameters<RequestHandler>[0]) => string,
): RequestHandler {
  const entries = new Map<
    string,
    {
      count: number;
      until: number;
    }
  >();

  return (req, res, next) => {
    const now = Date.now();

    for (const [id, entry] of entries)
      if (entry.until <= now) entries.delete(id);

    const id = key(req);
    const entry = entries.get(id) ?? { count: 0, until: now + windowMs };

    if ((!entries.has(id) && entries.size >= 10000) || ++entry.count > limit) {
      res.set("Retry-After", String(Math.ceil((entry.until - now) / 1000)));

      next(new HttpError(429, "Trop de tentatives. Réessayez plus tard."));

      return;
    }

    entries.set(id, entry);

    next();
  };
}
