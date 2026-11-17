# PISTE-003 — Modification du statut d'un ticket sans journalisation

Mise à jour : reproduction personnelle réussie le 17 novembre 2026. Voir [VULN-003](VULN-003.md). Les rubriques ci-dessous conservent la préparation initiale, pas le statut courant.

## Identifiant

PISTE-003. Analyse statique et test préparé le 17 novembre 2026. Aucune exécution de ce scénario n'est encore enregistrée. Aucun correctif appliqué.

## Nom de la vulnérabilité potentielle

Absence de trace d'audit lors d'une modification manuelle du statut d'un ticket.

## Description

Le dépôt tickets.repository.ts modifie le statut et invalide l'analyse IA dans une transaction, sans créer d'entrée AuditLog. À l'inverse, les modifications de rôles/comptes et les confirmations IA sont journalisées. La date updatedAt et la revision du ticket montrent un changement mais n'identifient pas son auteur ni l'ancien statut.

## Localisation

PATCH /tickets/:id/status ; src/controllers/tickets.controller.ts, src/services/tickets.service.ts et src/repositories/tickets.repository.ts, méthode updateStatus. L'identité de l'acteur n'est actuellement pas transmise au dépôt pour l'audit.

## Criticité provisoire

Faible dans le contexte scolaire : lacune de traçabilité à démontrer, pas une élévation de privilèges. Un acteur possédant déjà le droit de traitement pourrait fermer un ticket sans laisser de journal applicatif de cette action. Les permissions de la route ne sont pas contournées. La preuve envisagée ne permet pas d'affirmer l'absence de traces dans d'éventuels systèmes externes.

## Scénario d'exploitation prévu

Un agent fictif autorisé modifie un ticket OPEN en CLOSED. La modification doit réussir (200), puis le test recherche une trace identifiant l'auteur, le ticket, l'ancien et le nouveau statut. Le comportement suspecté est zéro entrée, alors que la modification est persistée. Le compte propriétaire et l'agent sont créés dans un schéma temporaire ; aucune donnée réelle n'est visée.

## Preuve prévue

Test : tests/audit-ticket-status.test.mjs, non ajouté à la suite DB standard à ce stade. Le mode vulnerable attend zéro entrée TICKET_STATUS_CHANGED. Le mode fixed attend une entrée avec actorId de l'agent, before=OPEN et after=CLOSED. Le test relève aussi le nombre total d'entrées pour ne pas confondre un nom d'action différent avec une absence totale de journal.

Un test préparé n'est pas une preuve. L'exécution personnelle et sa sortie restent attendues.

## Impact

Difficulté à attribuer une modification à son auteur et à reconstituer l'historique d'un ticket. Aucun accès non autorisé, suppression de données ou effacement d'un journal existant n'est démontré par ce scénario.

## Correction proposée — non appliquée

Transmettre l'identifiant de l'acteur authentifié jusqu'à la transaction de mise à jour. Lire l'ancien statut sous verrou, modifier le ticket et créer une entrée AuditLog avec targetType=TICKET, action=TICKET_STATUS_CHANGED, actorId, before et after. L'écriture du journal et le changement doivent être atomiques : si le journal échoue, la modification doit être annulée.

Avant, schéma simplifié du code présent :

```typescript
db.$transaction(async (tx) => {
  const ticket = await tx.ticket.update({ /* statut, revision */ });
  await tx.ticketAi.updateMany({ /* invalidation */ });
  return ticket;
});
```

Après proposé, à préciser lors de la correction : verrou du ticket → lecture de l'ancien statut → modification → invalidation IA → écriture d'audit dans la même transaction. Ne pas prétendre qu'un exemple simplifié constitue déjà un correctif appliqué.

## Retest

En attente. Après correction : vérifier la présence d'une seule trace exacte, les refus de permission habituels, et l'annulation du changement en cas d'échec provoqué du journal.
