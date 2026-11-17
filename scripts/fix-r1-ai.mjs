// Correctif ciblé : revalider l'autorisation avant réservation d'une analyse.
import { readFileSync, writeFileSync } from "node:fs";

const paths = [
  "src/repositories/ticket-authorization.ts",
  "src/services/ticket-ai.service.ts",
  "src/services/tickets.service.ts",
  "src/controllers/tickets.controller.ts",
  "tests/ai-postgres.test.mjs",
];
const files = paths.map((path) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n"),
);
if (files[1].includes('origin: "creation" | "retry"'))
  throw new Error("Correctif déjà présent : ne pas le réappliquer.");

function replace(index, before, after) {
  if (!files[index].includes(before))
    throw new Error(
      "Version inattendue : " + paths[index] + ". Aucun fichier écrit.",
    );
  files[index] = files[index].replace(before, after);
}

replace(
  0,
  "import { hasPermission }",
  'import type { Permission } from "../config/permissions.js";\nimport { hasPermission }',
);
replace(
  0,
  "  sessionId: string,\n",
  '  sessionId: string,\n  permission: Permission = "tickets:update-status",\n',
);
replace(
  0,
  '!hasPermission(actor.role, "tickets:update-status")',
  "!hasPermission(actor.role, permission)",
);

replace(
  1,
  'import { randomUUID } from "node:crypto";',
  'import { randomUUID } from "node:crypto";\nimport { authorizeTicketStatus } from "../repositories/ticket-authorization.js";',
);
replace(
  1,
  "async function analyze(value: string | string[], actor: TicketActor)",
  'async function analyze(value: string | string[], actor: TicketActor, sessionId = "", origin: "creation" | "retry" = "retry")',
);
replace(
  1,
  "const ticket = await db.$transaction(async (tx) => {\n",
  'const ticket = await db.$transaction(async (tx) => {\n      const currentScope = await authorizeTicketStatus(tx, actor.id, sessionId, origin === "creation" ? "tickets:create" : "tickets:update-status");\n',
);
replace(
  1,
  "where: { id, ...ticketVisibility(actor) },",
  "where: { id, AND: [ticketVisibility(actor), currentScope] },",
);
replace(
  1,
  'if (!current) throw new HttpError(404, "Ticket introuvable.");',
  'if (!current) throw new HttpError(404, "Ticket introuvable.");\n      if (origin === "creation" && current.ownerId !== actor.id)\n        throw new HttpError(403, "Analyse automatique réservée au ticket du créateur.");',
);

replace(
  2,
  "create: (input: unknown, actor: Actor) =>",
  'create: (input: unknown, actor: Actor, sessionId = "") =>',
);
replace(
  2,
  "ai.analyze(String(ticket.id), actor)",
  'ai.analyze(String(ticket.id), actor, sessionId, "creation")',
);
replace(
  3,
  "service.create(req.body, res.locals.user)",
  "service.create(req.body, res.locals.user, res.locals.sessionId)",
);
replace(
  3,
  "ai.analyze(req.params.id, res.locals.user)",
  "ai.analyze(req.params.id, res.locals.user, res.locals.sessionId)",
);

// Les appels directs du test doivent désormais fournir une vraie session fictive.
const call = /\.analyze\(String\((\w+)\.id\),\s*users\.(admin|agent)\)/g;
let calls = 0;
files[4] = files[4].replace(call, (_match, ticket, role) => {
  calls++;
  return `.analyze(String(${ticket}.id), users.${role}, (await db.session.findFirstOrThrow({ where: { userId: users.${role}.id, revokedAt: null } })).id)`;
});
if (calls !== 6)
  throw new Error(
    "Nombre inattendu d'appels de test : " + calls + ". Aucun fichier écrit.",
  );

paths.forEach((path, index) => writeFileSync(path, files[index]));
console.log("R1 IA : autorisation revérifiée sous verrou avant réservation.");
console.log(
  "Session fournie côté serveur ; création automatique et relance agent distinguées.",
);
console.log(
  "Correctif ciblé sur le lancement ; compiler et retester. Aucun appel OpenAI effectué.",
);
