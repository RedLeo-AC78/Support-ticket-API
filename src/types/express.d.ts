import type { User } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    // Renseignés par authenticate, avant les contrôleurs protégés.
    interface Locals {
      user: Pick<User, "id" | "email" | "role" | "status" | "createdAt">;
      sessionId: string;
    }
  }
}
