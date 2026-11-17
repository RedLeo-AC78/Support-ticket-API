// Appliquer depuis la racine support-ticket, après conservation de la preuve avant.
import { readFileSync, writeFileSync } from "node:fs";

const paths = [
  "src/repositories/tickets.repository.ts",
  "src/services/tickets.service.ts",
  "tests/ai-postgres.test.mjs",
];
const files = paths.map((path) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n"),
);

if (files[0].includes('action: "TICKET_STATUS_CHANGED"')) {
  console.log("Correctif VULN-003 déjà présent ; aucun fichier modifié.");
} else {
  const markers = [
    "      status: TicketStatus,\n",
    "      db.$transaction(async (tx) => {\n        const ticket = await tx.ticket.update({",
    "        return ticket;\n",
    "        ticketStatusInput(input),\n",
    'await ticketsRepository(db).updateStatus(pending.id, {}, "CLOSED");',
  ];
  if (
    !files[0].includes(markers[0]) ||
    !files[0].includes(markers[1]) ||
    !files[0].includes(markers[2]) ||
    !files[1].includes(markers[3]) ||
    !files[2].includes(markers[4])
  )
    throw new Error(
      "Version inattendue : aucun fichier modifié. Faire vérifier les marqueurs.",
    );

  files[0] = files[0]
    .replace(markers[0], markers[0] + "      actorId: number,\n")
    .replace(
      markers[1],
      `      db.$transaction(async (tx) => {
        // Mise à jour sans changement : verrouiller le ticket avant de lire son statut.
        const previous = await tx.ticket.update({
          where: { ...scope, id },
          data: { id },
          select: { status: true },
        });

        const ticket = await tx.ticket.update({`,
    )
    .replace(
      markers[2],
      `        await tx.auditLog.create({
          data: {
            actorId,
            targetId: id,
            targetType: "TICKET",
            action: "TICKET_STATUS_CHANGED",
            before: previous.status,
            after: status,
          },
        });

        return ticket;
`,
    );
  files[1] = files[1].replace(markers[3], markers[3] + "        actor.id,\n");
  files[2] = files[2].replace(
    markers[4],
    'await ticketsRepository(db).updateStatus(pending.id, {}, "CLOSED", users.admin.id);',
  );

  paths.forEach((path, index) => writeFileSync(path, files[index]));
  console.log(
    "VULN-003 : audit du changement de statut ajouté dans la transaction.",
  );
  console.log(
    "L'identifiant d'acteur vient du compte authentifié, pas du corps JSON.",
  );
  console.log("Compilation et retest restent à exécuter.");
}
