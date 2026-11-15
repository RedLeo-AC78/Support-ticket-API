import type { ErrorRequestHandler, RequestHandler } from "express";

import { Prisma } from "../generated/prisma/client.js";

import { HttpError } from "../utils/security.js";

export const notFound: RequestHandler = (_req, _res, next) =>
  next(new HttpError(404, "Route introuvable."));

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({ error: "Cette adresse email est déjà utilisée." });
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    res.status(404).json({ error: "Ticket introuvable." });
  } else if (error.type === "entity.parse.failed") {
    res.status(400).json({ error: "JSON invalide." });
  } else if (error.type === "entity.too.large") {
    res.status(413).json({ error: "Corps de requête trop volumineux." });
  } else {
    console.error(error);

    res.status(500).json({ error: "Erreur interne du serveur." });
  }
};
