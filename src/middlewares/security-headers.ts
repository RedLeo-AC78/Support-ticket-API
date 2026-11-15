import type { RequestHandler } from "express";

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");

  res.set("X-Content-Type-Options", "nosniff");

  next();
};
