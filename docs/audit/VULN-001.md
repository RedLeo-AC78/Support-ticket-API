# VULN-001 — Invitation après révocation des droits

## Identifiant

VULN-001. Statut : confirmée sur la version de départ, corrigée localement et retestée le 17 novembre 2026.

## Nom de la vulnérabilité

Autorisation périmée lors de la création ou du renvoi d'une invitation. Une requête déjà passée par les middlewares pouvait encore créer une invitation après révocation de son auteur.

## Description

Le middleware authenticate vérifie la session, puis requirePermission vérifie le rôle SUPER_ADMIN. Mais le service create/resend ne relisait ensuite ni l'état du compte ni sa session dans sa transaction. Entre ces deux étapes, une autre requête peut désactiver/rétrograder le compte ou révoquer la session. L'action déjà en vol continue alors sur une autorisation devenue périmée.

C'est une condition de concurrence entre le contrôle et l'utilisation d'une autorisation, dite TOCTOU. Référence de classification : [CWE-367](https://cwe.mitre.org/data/definitions/367.html). Elle concerne ici une fonction d'administration, proche de [OWASP API5:2023](https://github.com/OWASP/API-Security/blob/master/editions/2023/en/0xa5-broken-function-level-authorization.md). Ces références classent le problème ; la preuve propre au projet est le test ci-dessous.

## Localisation

- `src/services/invitations.service.ts` : create et resend.
- `src/controllers/users.controller.ts` : auparavant transmission du seul actorId.
- Endpoints : POST /users et POST /users/:id/invitation.
- Contrôle initial dans `middlewares/authentication.ts` et `routes/users.routes.ts`.

## Criticité

**Élevée**, par appréciation contextuelle (pas un score CVSS calculé). L'attaquant doit déjà disposer d'une session Super Admin et gagner une fenêtre de concurrence. Il ne s'agit donc pas d'une élévation depuis un compte USER ou anonyme. Mais il peut maintenir un accès privilégié via un nouveau Super Admin alors qu'un autre administrateur vient de le désactiver ou de le rétrograder.

## Scénario d'exploitation

1. Un Super Admin A possède un token valide et contrôle une adresse destinataire.
2. A commence POST /users avec role=SUPER_ADMIN (ou renvoie une invitation existante).
3. La requête passe l'authentification et les permissions.
4. Avant la transaction d'invitation, un autre Super Admin désactive/rétrograde A ; variante : la session de A est déconnectée.
5. La première requête continue et produit malgré tout le compte/code/email.
6. Pour la création, le destinataire accepte le code et se connecte en SUPER_ADMIN ACTIVE.

La révocation ne doit pas annuler rétroactivement une opération déjà validée. Le défaut testé est plus précis : la révocation est **déjà terminée avant le début de la transaction d'invitation**.

## Preuve d'exploitation (Proof of Concept)

Test : `tests/audit-invitations.test.mjs`. Il lance de vraies requêtes HTTP avec un PostgreSQL temporaire. Un Proxy de test suspend uniquement l'entrée dans la transaction, après les middlewares, afin de provoquer toujours le même ordre d'exécution. Ce crochet ne modifie ni les permissions, ni les données de la demande, ni le code métier. Il n'existe pas dans le serveur déployé. Il prouve la possibilité de l'entrelacement ; il ne mesure pas la probabilité de gagner la course sans instrumentation.

Requête représentative :

```http
POST /users
Authorization: Bearer <token-du-super-admin-A>
Content-Type: application/json

{"email":"destination-create-disabled@audit.test","role":"SUPER_ADMIN"}
```

Pendant la pause, un autre Super Admin exécute PATCH /users/{A}/status avec `{"status":"DISABLED"}`. Le test vérifie que cette opération réussit et qu'un nouveau GET /auth/me avec le token de A renvoie 401. Il libère ensuite l'invitation déjà en cours.

Extrait de [la sortie réellement obtenue avant correction](preuves/VULN-001-avant.txt) :

```text
{"endpoint":"create","revocation":"disabled","http":201,"destinationExists":true,"activeCodes":1,"emailsCaptured":1,"auditWrites":1}
IMPACT_CONFIRME : nouveau SUPER_ADMIN ACTIVE après désactivation de son créateur ; HTTP /auth/me=200.
```

| Endpoint | Révocation | HTTP avant | Codes | Emails simulés |
|---|---|---:|---:|---:|
| create | disabled | 201 | 1 | 1 |
| create | demoted | 201 | 1 | 1 |
| create | logout | 201 | 1 | 1 |
| resend | disabled | 200 | 1 | 1 |
| resend | demoted | 200 | 1 | 1 |
| resend | logout | 200 | 1 | 1 |

Pour reproduire l'ancienne version, utiliser **une copie de travail distincte** de la version ac4bb58, avec des dépendances installées et DATABASE_URL de test. Y copier le test courant, puis exécuter la commande ciblée du LOT8 avec AUDIT_EXPECT=vulnerable. Ne pas remplacer les sources corrigées dans le projet actif. Le [service vulnérable conservé](preuves/VULN-001-service-avant.txt) permet aussi de comparer les versions.

Le mode vulnerable réussit si la faille se produit : ce succès de test n'est pas un résultat « sécurisé ». Le mode fixed attend les refus et est utilisé par défaut dans la suite DB.

## Exécution personnelle avant correction

Le 17 novembre 2026 à 10:34:16 UTC (11:34:16 à Paris), l'élève a exécuté le test sur la copie isolée de ac4bb58. [Sortie brute](preuves/VULN-001-avant-eleve.txt) : trois créations 201, trois renvois 200 et IMPACT_CONFIRME pour activation/connexion d'un nouveau Super Admin. Le mode vulnerable valide la reproduction de la faille, pas la sécurité du code. Le retest du correctif avait été effectué plus tôt le même jour ; les preuves conservent cet ordre.

## Impact

Création d'un nouveau compte privilégié et génération de codes après révocation de l'autorisation initiale. Un accès administratif peut ainsi subsister via le destinataire contrôlé. Le test confirme réellement activation et connexion sur un scénario ; les conséquences supplémentaires (consultation des utilisateurs/tickets, gestion des comptes) découlent des droits d'un Super Admin mais n'ont pas été exercées sur les données réelles.

## Correction

Avant, la transaction commençait directement par la création :

```typescript
async function create(input: unknown, actorId: number) {
  // Validation du corps...
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({ /* données de l'invitation */ });
    // Audit...
    return created;
  });
}
```

Après, le contrôleur transmet aussi res.locals.sessionId et le service recontrôle l'autorisation avant l'écriture :

```typescript
async function create(input: unknown, actorId: number, sessionId: string) {
  // Validation du corps...
  const user = await db.$transaction(async (tx) => {
    await authorizeInvitation(tx, actorId, sessionId);
    const created = await tx.user.create({ /* données de l'invitation */ });
    // Audit...
    return created;
  });
}
```

Les extraits abrègent uniquement les données et validations inchangées. Pour resend, authorizeInvitation reçoit aussi l'id du destinataire. Le helper verrouille les comptes par ordre d'id pour éviter l'inversion de verrous entre les changements de comptes, puis relit sous verrou :

```typescript
if (
  actor.status !== "ACTIVE" || actor.role !== "SUPER_ADMIN" ||
  !session || session.userId !== actorId || session.revokedAt ||
  session.expiresAt <= now || session.accessExpiresAt <= now
) throw new HttpError(403, "Autorisation révoquée.");
```

Le verrou du compte est également utilisé par logout, le reset et les changements de statut/rôle. Ainsi, soit l'invitation est validée avant la révocation, soit la révocation gagne et l'invitation échoue. Le contrôle et l'écriture appartiennent à la même transaction. L'envoi email reste après commit ; aucune livraison externe n'est tentée quand la transaction échoue.

## Retest

Retest également exécuté personnellement par l'élève le 17 novembre 2026 à 09:58:34 UTC : [preuve brute](preuves/VULN-001-retest-eleve.txt). Résultat : six réponses 403, aucun nouveau code, aucun email capturé, aucune écriture d'audit d'invitation ; 1 test réussi, 0 échec. Les artefacts d'encodage du terminal n'altèrent pas les champs JSON observés.

[Sortie après correction](preuves/VULN-001-apres.txt), même test et mêmes six variantes :

```text
{"endpoint":"create","revocation":"disabled","http":403,"destinationExists":false,"activeCodes":0,"emailsCaptured":0,"auditWrites":0}
{"endpoint":"resend","revocation":"disabled","http":403,"destinationExists":true,"activeCodes":0,"emailsCaptured":0,"auditWrites":0}
```

Les six requêtes donnent 403. Aucune nouvelle invitation, aucun email et aucune écriture d'audit USER_INVITED/INVITATION_REISSUED. Le destinataire de resend existait avant le test ; sa présence ne représente pas un nouveau compte créé par l'attaque.

Les invitations légitimes sont encore testées par postgres.test.mjs. Les autres parcours restent vérifiés par la suite complète. Le test ciblé est désormais inclus dans `npm.cmd run test:db`, donc dans GitHub Actions au prochain push.
