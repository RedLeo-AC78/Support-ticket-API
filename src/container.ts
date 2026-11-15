import type { PrismaClient } from "./generated/prisma/client.js";

import { jwtService } from "./config/jwt.js";

import type { Mailer } from "./services/mail.service.js";
import { authService } from "./services/auth.service.js";
import { usersService } from "./services/users.service.js";
import { invitationsService } from "./services/invitations.service.js";
import { passwordResetService } from "./services/password-reset.service.js";
import { ticketsService } from "./services/tickets.service.js";

import { ticketsRepository } from "./repositories/tickets.repository.js";

import { authController } from "./controllers/auth.controller.js";
import { usersController } from "./controllers/users.controller.js";
import { ticketsController } from "./controllers/tickets.controller.js";

import { authenticate } from "./middlewares/authentication.js";

// Composition explicite : une instance des services et de leurs compteurs par application.
export function createContainer(
  db: PrismaClient,
  secret: string | undefined,
  mailer: Mailer,
) {
  const jwt = jwtService(secret);
  const invitations = invitationsService(db, mailer);
  const resets = passwordResetService(db, mailer);

  return {
    authenticate: authenticate(db, jwt),
    auth: authController(authService(db, jwt), invitations, resets),
    users: usersController(usersService(db), invitations),
    tickets: ticketsController(ticketsService(ticketsRepository(db))),
    drain: resets.drain,
  };
}
