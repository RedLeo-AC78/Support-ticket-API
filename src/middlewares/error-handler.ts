import type { ErrorRequestHandler, RequestHandler } from "express";

import { Prisma } from "../generated/prisma/client.js";

import { HttpError } from "../utils/security.js";

export const notFound: RequestHandler = (_req, _res, next) =>
  next(new HttpError(404, "Route introuvable."));

const codes: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);

  let status = 500;
  let message = "Erreur interne du serveur.";

  if (error instanceof HttpError) {
    status = error.status;

    message = error.message;
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    status = 409;

    message = "Cette ressource existe déjà.";
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    status = 404;

    message = "Ressource introuvable.";
  } else if (error?.type === "entity.parse.failed") {
    status = 400;

    message = "JSON invalide.";
  } else if (error?.type === "entity.too.large") {
    status = 413;

    message = "Corps de requête trop volumineux.";
  } else if (error?.status === 415) {
    status = 415;

    message = "Encodage non pris en charge.";
  } else {
    // Ne pas imprimer une erreur Prisma susceptible de contenir des données ou secrets.
    console.error("Erreur interne pendant le traitement HTTP.");
  }

  res
    .status(status)
    .json({ error: message, code: codes[status] ?? "HTTP_ERROR", status });
};
