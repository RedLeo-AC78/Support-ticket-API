import express from "express";

import type { PrismaClient } from "./generated/prisma/client.js";
import { createMailer, type Mailer } from "./services/mail.service.js";
import { createContainer } from "./container.js";

import { authRoutes } from "./routes/auth.routes.js";
import { usersRoutes } from "./routes/users.routes.js";
import { ticketsRoutes } from "./routes/tickets.routes.js";

import { securityHeaders } from "./middlewares/security-headers.js";
import { errorHandler, notFound } from "./middlewares/error-handler.js";
import { rateLimit } from "./middlewares/rate-limit.js";
import { openapi } from "./docs/openapi.js";
import type { AiProvider } from "./types/ai.js";

export function createApp(
  db: PrismaClient,
  secret = process.env.JWT_SECRET,
  mailer: Mailer = createMailer(),
  aiProvider: AiProvider | null = null,
) {
  const dependencies = createContainer(db, secret, mailer, aiProvider);
  const app = express();

  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(rateLimit(300, 60 * 1000, (req) => req.ip ?? "unknown"));
  app.use(express.json({ limit: "64kb" }));

  app.locals.waitForBackgroundTasks = dependencies.drain;

  app.get("/openapi.json", (_req, res) => res.json(openapi));

  app.use("/auth", authRoutes(dependencies.auth, dependencies.authenticate));
  app.use("/users", usersRoutes(dependencies.users, dependencies.authenticate));
  app.use(
    "/tickets",
    ticketsRoutes(dependencies.tickets, dependencies.authenticate),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
