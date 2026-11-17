// Correctif pédagogique : à lancer depuis la racine support-ticket.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const helperPath = "src/repositories/ticket-authorization.ts";
const paths = [
  "src/repositories/tickets.repository.ts",
  "src/services/tickets.service.ts",
  "src/controllers/tickets.controller.ts",
  "tests/ai-postgres.test.mjs",
];
const files = paths.map((path) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n"),
);

if (existsSync(helperPath))
  throw new Error(
    "Helper déjà présent : faire vérifier l'état du correctif avant de relancer.",
  );

const replacements = [
  [
    0,
    "import type { TicketListInput }",
    'import { authorizeTicketStatus } from "./ticket-authorization.js";\n\nimport type { TicketListInput }',
  ],
  [
    0,
    "      actorId: number,\n",
    "      actorId: number,\n      sessionId: string,\n",
  ],
  [
    0,
    "      db.$transaction(async (tx) => {\n",
    "      db.$transaction(async (tx) => {\n        const currentScope = await authorizeTicketStatus(tx, actorId, sessionId);\n",
  ],
  [0, "where: { ...scope, id },", "where: { AND: [scope, currentScope], id },"],
  [
    1,
    "updateStatus: (value: string | string[], input: unknown, actor: Actor) =>",
    "updateStatus: (value: string | string[], input: unknown, actor: Actor, sessionId: string) =>",
  ],
  [1, "        actor.id,\n", "        actor.id,\n        sessionId,\n"],
  [
    2,
    "service.updateStatus(req.params.id, req.body, res.locals.user)",
    "service.updateStatus(req.params.id, req.body, res.locals.user, res.locals.sessionId)",
  ],
  [
    3,
    "      users.admin.id,\n",
    "      users.admin.id,\n      (await db.session.findFirstOrThrow({ where: { userId: users.admin.id, revokedAt: null } })).id,\n",
  ],
];

for (const [index, before, after] of replacements) {
  if (!files[index].includes(before))
    throw new Error(
      "Version inattendue dans " + paths[index] + " ; aucun fichier modifié.",
    );
  // Les deux requêtes du dépôt doivent conserver le périmètre relu sous verrou.
  if (index === 0 && before.startsWith("where:")) {
    const start = files[index].indexOf("    updateStatus:");
    if (start < 0)
      throw new Error(
        "Méthode updateStatus introuvable ; aucun fichier modifié.",
      );
    files[index] =
      files[index].slice(0, start) +
      files[index].slice(start).replaceAll(before, after);
  } else {
    files[index] = files[index].replace(before, after);
  }
}

const helper = `import type { Prisma } from "../generated/prisma/client.js";
import { lockUser } from "./users.repository.js";
import { hasPermission } from "../config/permissions.js";
import { ticketVisibility } from "../config/ticket-access.js";
import { HttpError } from "../utils/security.js";

export async function authorizeTicketStatus(tx: Prisma.TransactionClient, actorId: number, sessionId: string) {
  if (!(await tx.user.findUnique({ where: { id: actorId } })))
    throw new HttpError(403, "Autorisation révoquée.");

  // Même verrou de compte que les changements de rôle, statut, logout et reset.
  await lockUser(tx, actorId);
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  const now = new Date();

  if (actor.status !== "ACTIVE" || !hasPermission(actor.role, "tickets:update-status") ||
      !session || session.userId !== actorId || session.revokedAt ||
      session.expiresAt <= now || session.accessExpiresAt <= now)
    throw new HttpError(403, "Autorisation révoquée.");

  return ticketVisibility(actor);
}
`;

paths.forEach((path, index) => writeFileSync(path, files[index]));
writeFileSync(helperPath, helper);
console.log(
  "R1 tickets : acteur et session revérifiés sous verrou avant modification.",
);
console.log(
  "Périmètre recalculé depuis le rôle actuel ; audit conservé dans la transaction.",
);
console.log(
  "Compiler puis exécuter le retest. Aucun test exécuté par ce script.",
);
