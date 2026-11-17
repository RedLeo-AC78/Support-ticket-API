import type { Prisma } from "../generated/prisma/client.js";
import { lockUser } from "./users.repository.js";
import { hasPermission } from "../config/permissions.js";
import { ticketVisibility } from "../config/ticket-access.js";
import { HttpError } from "../utils/security.js";

export async function authorizeTicketStatus(
  tx: Prisma.TransactionClient,
  actorId: number,
  sessionId: string,
) {
  if (!(await tx.user.findUnique({ where: { id: actorId } })))
    throw new HttpError(403, "Autorisation révoquée.");

  // Même verrou de compte que les changements de rôle, statut, logout et reset.
  await lockUser(tx, actorId);
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  const now = new Date();

  if (
    actor.status !== "ACTIVE" ||
    !hasPermission(actor.role, "tickets:update-status") ||
    !session ||
    session.userId !== actorId ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.accessExpiresAt <= now
  )
    throw new HttpError(403, "Autorisation révoquée.");

  return ticketVisibility(actor);
}
