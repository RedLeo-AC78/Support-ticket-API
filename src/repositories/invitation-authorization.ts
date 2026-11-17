import type { Prisma } from "../generated/prisma/client.js";

import { lockUser } from "./users.repository.js";
import { HttpError } from "../utils/security.js";

// Recontrôler les droits sous les mêmes verrous que la révocation de compte/session.
export async function authorizeInvitation(
  tx: Prisma.TransactionClient,
  actorId: number,
  sessionId: string,
  targetId?: number,
) {
  for (const id of [
    ...new Set([actorId, ...(targetId === undefined ? [] : [targetId])]),
  ].sort((a, b) => a - b)) {
    if (!(await tx.user.findUnique({ where: { id } })))
      throw new HttpError(
        id === actorId ? 403 : 404,
        "Compte introuvable ou autorisation révoquée.",
      );

    await lockUser(tx, id);
  }

  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  const now = new Date();

  if (
    actor.status !== "ACTIVE" ||
    actor.role !== "SUPER_ADMIN" ||
    !session ||
    session.userId !== actorId ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.accessExpiresAt <= now
  )
    throw new HttpError(403, "Autorisation révoquée.");
}
