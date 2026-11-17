# VULN-003 — Changement de statut de ticket sans trace d'audit

## Identifiant

VULN-003, issue de PISTE-003. Reproduction personnelle le 17 novembre 2026 à 13:19:15 UTC (14:19:15 à Paris). Correctif exécuté par l’élève ; compilation réussie et retest ciblé réussi le 17 novembre 2026 à 13:56:58 UTC (14:56:58 à Paris).

## Nom de la vulnérabilité

Lacune de traçabilité : une modification manuelle du statut d'un ticket ne produit aucune entrée dans le journal applicatif.

## Description

La route contrôle le rôle de l'acteur. Le dépôt modifie le statut et invalide l'analyse IA dans une transaction, mais n'insère pas d'AuditLog. Le champ updatedAt et la revision du ticket indiquent une modification sans conserver son auteur ni la transition. Les actions de confirmation IA et les changements de rôle disposent déjà de telles traces.

## Localisation

PATCH /tickets/:id/status ; updateStatus dans src/repositories/tickets.repository.ts et src/services/tickets.service.ts. L'identifiant de l'acteur authentifié n'est pas transmis au dépôt dans la version testée.

## Criticité

**Faible dans le contexte scolaire** : défaut de traçabilité d'une action autorisée. Un agent peut modifier un ticket sans journal applicatif attribuable, ce qui complique une enquête ou une contestation. Le scénario ne démontre aucun accès sans permission, aucun effacement d'un journal existant ni aucune absence de trace dans un éventuel système externe. Il s'agit d'une lacune de contrôle de sécurité, distincte d'une prise de contrôle de compte.

## Scénario d'exploitation

Un agent fictif s'authentifie et ferme un ticket OPEN appartenant à un utilisateur fictif. Le serveur accepte la modification et la persiste. Le test compare ensuite le journal avant/après et recherche la trace du changement. Un acteur ayant déjà la permission peut ainsi effectuer une action qui ne sera pas attribuable par le journal applicatif.

## Preuve d'exploitation

[Sortie brute personnelle](preuves/PISTE-003-avant-eleve.txt), nom conservé depuis la phase de piste. Test : tests/audit-ticket-status.test.mjs. Il traverse réellement HTTP et PostgreSQL, dans un schéma temporaire, sans appel IA ou email.

```json
{"actorRole":"AGENT","http":200,"statusBefore":"OPEN","statusAfter":"CLOSED","auditCountBefore":0,"auditCountAfter":0,"matchingAuditRows":0}
```

Mode vulnerable : 1 test réussi, 0 échec. Le test réussit parce qu'il constate le défaut attendu. Le total du journal reste à zéro : le résultat n'est donc pas uniquement dû à une recherche sur un mauvais nom d'action. L'empreinte du dépôt testée est 9a18910a02620aa27b9d60fa9de4e716e8add02b5a19846e601f9688a0c75e80.

## Impact

Impossibilité de retrouver l'auteur et l'ancien statut à partir du journal applicatif. Le changement reste visible dans l'état actuel du ticket ; aucune suppression du ticket ou de données d'utilisateur n'est démontrée.

## Correction appliquée par l’élève

L’élève a exécuté scripts/fix-vuln003.mjs, puis le formatage et la compilation. Le correctif transmet actor.id, issu du compte authentifié, jusqu'au dépôt. L'identité ne vient pas du JSON envoyé par le client. Le dépôt verrouille le ticket avant lecture de l'ancien statut, puis modifie le statut, invalide l'analyse IA et écrit l'audit dans la même transaction. Le verrou évite de journaliser une ancienne valeur périmée lors de modifications concurrentes.

Avant, extrait simplifié :

```typescript
db.$transaction(async (tx) => {
  const ticket = await tx.ticket.update({ /* changement de statut */ });
  await tx.ticketAi.updateMany({ /* invalidation */ });
  return ticket;
});
```

Après correction, étapes essentielles :

```typescript
const previous = await tx.ticket.update({
  where: { ...scope, id }, data: { id }, select: { status: true },
}); // verrou de ligne, sans changer l'identifiant
// Changement du statut et invalidation IA, dans la même transaction.
await tx.auditLog.create({ data: {
  actorId, targetId: id, targetType: "TICKET",
  action: "TICKET_STATUS_CHANGED", before: previous.status, after: status,
} });
```

Les extraits abrègent les données inchangées ; le script conserve les modifications effectivement appliquées. Le retest personnel ci-dessous confirme la création de la trace. Pas de migration nécessaire : la table d'audit existe déjà.

## Retest

Retest personnel le 17 novembre 2026 à 13:56:58 UTC : [sortie brute](preuves/VULN-003-apres-eleve.txt). HTTP 200, OPEN → CLOSED, auditCountBefore=0, auditCountAfter=1, matchingAuditRows=1 ; 1 test réussi, 0 échec. Les assertions vérifient également actorId de l’agent, before=OPEN et after=CLOSED. Le test a ensuite été complété pour vérifier un refus USER (403) et un échec provoqué du journal (500 avec statut et revision inchangés). Le contrôle complémentaire a ensuite été exécuté personnellement le 17 novembre 2026 à 14:08:23 UTC (15:08:23 à Paris) : [preuve distincte](preuves/VULN-003-atomicite-eleve.txt). Résultats : userAttemptHttp=403, auditFailureHttp=500, statut CLOSED conservé, revisionUnchanged=true et auditRowsAfterFailure=1. Le changement et la tentative de nouvelle trace sont donc annulés ensemble lors de la panne provoquée. Bilan : 1 test réussi, 0 échec. Le log d’erreur interne est attendu pour ce scénario.

## Commentaire rédigé

Non-régression complète exécutée ensuite par l'élève : [21 tests sans base réussis, 7 ignorés, 0 échec](preuves/VULN-003-tests-eleve.txt), puis [7 scénarios PostgreSQL réussis, 0 échec](preuves/VULN-003-tests-db-eleve.txt). La suite DB inclut désormais VULN-001, VULN-002 et VULN-003. Le résultat CI sur GitHub n'est pas déduit de cette exécution locale.

J'ai fermé un ticket avec un compte AGENT fictif dans le test local. La modification a été acceptée et enregistrée, mais le nombre de traces d'audit est resté à zéro. Le problème concerne donc l'attribution des actions et non les permissions d'accès. Le correctif préparé ajoute l'identité de l'auteur et les statuts avant/après dans la transaction. J’ai appliqué le correctif et rejoué le scénario : la modification réussit et une trace identifie désormais l’agent et les statuts OPEN puis CLOSED. J’ai également provoqué une panne du journal dans le schéma temporaire : la modification a été annulée, le statut et la version sont restés inchangés. Un USER a reçu 403 pour la même route, ce qui confirme le maintien de la permission dans le cas testé.
