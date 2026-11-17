# Rapport d'audit de sécurité — Support Ticket API

**Projet scolaire :** application de gestion de tickets de support informatique.  
**Groupe :** Adam Cheria / Jacques OWONE.  
**Date de rédaction :** 17 novembre 2026.  
**Version de référence avant correction :** commit `ac4bb58`, branche `develop`.  
**État du rapport :** audit en cours ; deux vulnérabilités documentées à ce stade.

## Objectif

Cet audit vise à identifier des failles de l'application, vérifier leur exploitation et contrôler les corrections. Chaque fiche présente le problème, sa cause, les conséquences, la preuve d'exécution, le code avant/après et le retest. Les conclusions s'appuient sur les résultats disponibles ; une piste sans reproduction n'est pas comptée comme une vulnérabilité confirmée.

## Périmètre et conditions des tests

L'application utilise Node.js, Express, TypeScript et PostgreSQL avec Prisma. L'examen porte sur l'API, l'authentification, les permissions et les opérations de gestion des comptes et tickets.

Les tests décrits s'exécutent localement avec des comptes fictifs dans des schémas PostgreSQL temporaires. Les requêtes HTTP traversent réellement l'application. Les emails sont capturés en mémoire et aucun appel OpenAI payant n'est nécessaire. Les comptes et tickets habituels du projet ne sont pas utilisés pour l'exploitation.

Le réseau de l'école, GitHub, Brevo et OpenAI ne sont pas des cibles de cet audit. Les dépendances, la configuration d'un hébergement et les tests de charge ne sont pas évalués par cette première fiche.

## Synthèse des vulnérabilités

| Identifiant | Problème | Criticité | Résultat |
|---|---|---|---|
| VULN-001 | Invitation après révocation des droits de l'auteur | Élevée, dans les conditions précisées dans la fiche | Reproduction personnelle avant correction et retest réussis |
| VULN-002 | Quota email consommé par des mots de passe manifestement invalides | Faible dans le contexte testé | Reproduction personnelle, correction exécutée et retest ciblé réussi |

Les six cas de VULN-001 sont des variantes d'une même faille, et ne sont pas comptés comme six vulnérabilités différentes.

## Traçabilité des preuves

L'audit a été mené avec une assistance IA pour la lecture du code, la préparation des tests et la rédaction. Les résultats consignés doivent correspondre à des exécutions réelles. Lors de la reprise du travail, le correctif et les premières traces avant/après étaient déjà présents, non commités. Leur provenance n'est pas assimilée à une manipulation personnelle de l'élève. Les deux exécutions personnelles sont désormais conservées séparément. Le retest du correctif a été réalisé avant la reproduction de la version vulnérable ; cet ordre chronologique est conservé dans les preuves.

| Élément | Origine et état |
|---|---|
| Exploitation avant correction | Reproduction personnelle réalisée le 17 novembre 2026 à 10:34:16 UTC (11:34:16 à Paris), en complément des traces initiales |
| Correctif | Code déjà présent dans le dossier lors de la reprise de l'audit ; explication et extraits dans la fiche |
| Retest personnel | Exécuté le 17 novembre 2026 à 09:58:34 UTC, soit 10:58:34 à Paris ; sortie et capture vérifiées |

Les preuves brutes sont conservées dans `docs/audit/preuves/`. Certains symboles et accents du retest personnel sont mal décodés par le terminal. Les champs JSON, statuts HTTP et nombres restent lisibles ; le fichier original n'est pas réécrit.

## VULN-001 — Invitation après révocation des droits

### Identifiant

VULN-001. Statut : confirmée sur la version de départ, corrigée localement et retestée le 17 novembre 2026.

### Nom de la vulnérabilité

Autorisation périmée lors de la création ou du renvoi d'une invitation. Une requête déjà passée par les middlewares pouvait encore créer une invitation après révocation de son auteur.

### Description

Le middleware authenticate vérifie la session, puis requirePermission vérifie le rôle SUPER_ADMIN. Mais le service create/resend ne relisait ensuite ni l'état du compte ni sa session dans sa transaction. Entre ces deux étapes, une autre requête peut désactiver/rétrograder le compte ou révoquer la session. L'action déjà en vol continue alors sur une autorisation devenue périmée.

C'est une condition de concurrence entre le contrôle et l'utilisation d'une autorisation, dite TOCTOU. Référence de classification : [CWE-367](https://cwe.mitre.org/data/definitions/367.html). Elle concerne ici une fonction d'administration, proche de [OWASP API5:2023](https://github.com/OWASP/API-Security/blob/master/editions/2023/en/0xa5-broken-function-level-authorization.md). Ces références classent le problème ; la preuve propre au projet est le test ci-dessous.

### Localisation

- `src/services/invitations.service.ts` : create et resend.
- `src/controllers/users.controller.ts` : auparavant transmission du seul actorId.
- Endpoints : POST /users et POST /users/:id/invitation.
- Contrôle initial dans `middlewares/authentication.ts` et `routes/users.routes.ts`.

### Criticité

**Élevée**, par appréciation contextuelle (pas un score CVSS calculé). L'attaquant doit déjà disposer d'une session Super Admin et gagner une fenêtre de concurrence. Il ne s'agit donc pas d'une élévation depuis un compte USER ou anonyme. Mais il peut maintenir un accès privilégié via un nouveau Super Admin alors qu'un autre administrateur vient de le désactiver ou de le rétrograder.

### Scénario d'exploitation

1. Un Super Admin A possède un token valide et contrôle une adresse destinataire.
2. A commence POST /users avec role=SUPER_ADMIN (ou renvoie une invitation existante).
3. La requête passe l'authentification et les permissions.
4. Avant la transaction d'invitation, un autre Super Admin désactive/rétrograde A ; variante : la session de A est déconnectée.
5. La première requête continue et produit malgré tout le compte/code/email.
6. Pour la création, le destinataire accepte le code et se connecte en SUPER_ADMIN ACTIVE.

La révocation ne doit pas annuler rétroactivement une opération déjà validée. Le défaut testé est plus précis : la révocation est **déjà terminée avant le début de la transaction d'invitation**.

### Preuve d'exploitation (Proof of Concept)

Test : `tests/audit-invitations.test.mjs`. Il lance de vraies requêtes HTTP avec un PostgreSQL temporaire. Un Proxy de test suspend uniquement l'entrée dans la transaction, après les middlewares, afin de provoquer toujours le même ordre d'exécution. Ce crochet ne modifie ni les permissions, ni les données de la demande, ni le code métier. Il n'existe pas dans le serveur déployé. Il prouve la possibilité de l'entrelacement ; il ne mesure pas la probabilité de gagner la course sans instrumentation.

Requête représentative :

```http
POST /users
Authorization: Bearer <token-du-super-admin-A>
Content-Type: application/json

{"email":"destination-create-disabled@audit.test","role":"SUPER_ADMIN"}
```

Pendant la pause, un autre Super Admin exécute PATCH /users/{A}/status avec `{"status":"DISABLED"}`. Le test vérifie que cette opération réussit et qu'un nouveau GET /auth/me avec le token de A renvoie 401. Il libère ensuite l'invitation déjà en cours.

Extrait de [la sortie réellement obtenue avant correction](audit/preuves/VULN-001-avant.txt) :

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

Pour reproduire l'ancienne version, utiliser **une copie de travail distincte** de la version ac4bb58, avec des dépendances installées et DATABASE_URL de test. Y copier le test courant, puis exécuter la commande ciblée avec AUDIT_EXPECT=vulnerable. Ne pas remplacer les sources corrigées dans le projet actif. Le [service vulnérable conservé](audit/preuves/VULN-001-service-avant.txt) permet aussi de comparer les versions.

Le mode vulnerable réussit si la faille se produit : ce succès de test n'est pas un résultat « sécurisé ». Le mode fixed attend les refus et est utilisé par défaut dans la suite DB.

### Impact

Création d'un nouveau compte privilégié et génération de codes après révocation de l'autorisation initiale. Un accès administratif peut ainsi subsister via le destinataire contrôlé. Le test confirme réellement activation et connexion sur un scénario ; les conséquences supplémentaires (consultation des utilisateurs/tickets, gestion des comptes) découlent des droits d'un Super Admin mais n'ont pas été exercées sur les données réelles.

### Correction

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

### Retest

Retest également exécuté personnellement par l'élève le 17 novembre 2026 à 09:58:34 UTC : [preuve brute](audit/preuves/VULN-001-retest-eleve.txt). Résultat : six réponses 403, aucun nouveau code, aucun email capturé, aucune écriture d'audit d'invitation ; 1 test réussi, 0 échec. Les artefacts d'encodage du terminal n'altèrent pas les champs JSON observés.

[Sortie après correction](audit/preuves/VULN-001-apres.txt), même test et mêmes six variantes :

```text
{"endpoint":"create","revocation":"disabled","http":403,"destinationExists":false,"activeCodes":0,"emailsCaptured":0,"auditWrites":0}
{"endpoint":"resend","revocation":"disabled","http":403,"destinationExists":true,"activeCodes":0,"emailsCaptured":0,"auditWrites":0}
```

Les six requêtes donnent 403. Aucune nouvelle invitation, aucun email et aucune écriture d'audit USER_INVITED/INVITATION_REISSUED. Le destinataire de resend existait avant le test ; sa présence ne représente pas un nouveau compte créé par l'attaque.

Les invitations légitimes sont encore testées par postgres.test.mjs. Les autres parcours restent vérifiés par la suite complète. Le test ciblé est désormais inclus dans `npm.cmd run test:db`, donc dans GitHub Actions au prochain push.

### Analyse rédigée du résultat

Une invitation pouvait continuer après le retrait des droits de son auteur, car le contrôle initial ne garantissait pas que ces droits étaient encore valables au moment de l'écriture en base. Le correctif revérifie le compte et sa session dans la transaction, sous verrou. J'ai rejoué les six situations sur le code corrigé : elles sont désormais refusées avec le statut HTTP 403. Aucun code d'invitation ni email n'a été produit pendant ces tentatives. Le résultat confirme l'efficacité du correctif pour les scénarios testés.

J'ai également reproduit personnellement la faille dans la copie isolée de la version ac4bb58. Les créations ont renvoyé 201 et les renvois 200 malgré la révocation. Le test a confirmé l'activation puis la connexion d'un nouveau Super Admin. Sur la version corrigée, les six variantes avaient été refusées avec 403. Les dates des preuves montrent que le retest a été exécuté avant la reproduction de l'ancienne version.

## VULN-002 — Blocage de connexion par consommation du quota email

### Identifiant

VULN-002. Comportement reproduit personnellement par l'élève le 17 novembre 2026 à 11:20:35 UTC (12:20:35 à Paris). Correctif exécuté par l’élève, compilation réussie et retest personnel réussi le 17 novembre 2026 à 11:28:33 UTC (12:28:33 à Paris).

### Nom de la vulnérabilité

Des mots de passe manifestement invalides consomment le quota de connexion d'une adresse et empêchent temporairement sa connexion légitime.

### Description

La limite email est exécutée avant la validation du corps. Même un mot de passe d'un caractère, qui ne peut pas être accepté par la politique de l'application, consomme une tentative. Le quota est partagé par adresse email, indépendamment du mot de passe. Le scénario local montre une connexion correcte ensuite refusée par le quota, sans atteindre la vérification du mot de passe.

### Localisation

src/routes/auth.routes.ts, POST /auth/login : ordre des middlewares. Validation dans src/services/auth.service.ts et src/utils/security.ts.

### Criticité

**Faible dans le périmètre scolaire testé** : indisponibilité temporaire d'une nouvelle connexion, sans accès à des données ni compromission du compte. La limite IP réduit les répétitions. Un blocage entre adresses IP différentes est suggéré par la clé email globale, mais n'est pas démontré par cette exécution locale. Le délai annoncé est de 900 secondes ; l'expiration effective après attente de 15 minutes n'a pas été mesurée.

### Scénario d'exploitation

Le test crée un compte fictif, vérifie qu'il peut se connecter (200), puis envoie neuf mots de passe trop courts (400). La première connexion ayant consommé une unité, les dix unités du quota sont atteintes. La prochaine connexion avec le bon mot de passe est refusée (429). Onze requêtes restent sous le quota IP de 30 : ce dernier n'explique pas le refus observé.

### Preuve d'exploitation

[Sortie personnelle avant correction](audit/preuves/PISTE-002-avant-eleve.txt), conservée sous son nom initial pour garder la trace de la phase de piste.

```json
{"baseline":200,"invalidRequests":[400,400,400,400,400,400,400,400,400],"legitimateLoginAfter":429,"retryAfter":"900","code":"TOO_MANY_REQUESTS"}
```

Le test tests/audit-login-quota.test.mjs utilise des requêtes HTTP réelles, une base temporaire et un compte fictif. Aucun email ni appel IA. Mode vulnerable : 1 test réussi, 0 échec signifie que le comportement problématique attendu a été reproduit. L'empreinte SHA-256 de la route est dans la preuve brute. Aucun token ni mot de passe n'y est affiché.

### Impact

Refus temporaire d'une nouvelle connexion malgré un mot de passe correct. Les sessions existantes ne sont pas révoquées. Aucun accès aux données ni contrôle du compte n'est démontré.

### Correction appliquée par l’élève

L’élève a exécuté scripts/fix-vuln002.mjs, puis le formatage et la compilation. Le script ajoute la validation avant le quota email et adapte le test HTTP existant pour vérifier la limite IP. Les extraits suivants décrivent le correctif effectivement appliqué.

Avant :

```typescript
router.post("/login", byIp, rateLimit(10, 15 * 60 * 1000, emailKey), controller.login);
```

Après correction :

```typescript
const validateLoginBody: RequestHandler = (req, _res, next) => {
  const body = objectBody(req.body, ["email", "password"]);
  emailValue(body.email);
  passwordValue(body.password);
  next();
};

router.post("/login", byIp, validateLoginBody,
  rateLimit(10, 15 * 60 * 1000, emailKey), controller.login);
```

La limite IP reste avant validation, pour borner aussi les requêtes invalides. Le contrôle métier est conservé dans le service. Les mauvais mots de passe de forme valide doivent toujours consommer le quota email : il s'agit d'une correction ciblée, pas d'une suppression générale du risque de blocage lié aux politiques anti-bruteforce.

### Retest

Retest personnel enregistré le 17 novembre 2026 à 11:28:33 UTC : [preuve brute](audit/preuves/VULN-002-apres-eleve.txt). Résultat observé : baseline=200, neuf réponses 400, legitimateLoginAfter=200, retryAfter=null, code=SUCCESS ; 1 test réussi et 0 échec. L’empreinte SHA-256 de la route corrigée est 5851349ea074b2abf5d201d8d614850cc627e78839d46c12ee8a46993883df21. Les preuves avant et après sont conservées sans réécriture. Le contrôle complémentaire a été exécuté personnellement le 17 novembre 2026 à 12:52:01 UTC (13:52:01 à Paris) : [preuve brute](audit/preuves/VULN-002-controle-quota-eleve.txt). Les neuf saisies trop courtes sont refusées avec 400 sans empêcher la connexion correcte suivante (200). Huit mauvais mots de passe de longueur valide donnent ensuite 401, puis la connexion après épuisement du quota donne 429, code TOO_MANY_REQUESTS et Retry-After=897. Vingt requêtes seulement ont été utilisées, sous le quota IP de trente : le refus correspond au quota email. Résultat : 1 test réussi, 0 échec. L’empreinte de route est identique à celle du premier retest corrigé.

### Commentaire rédigé

J'ai reproduit un blocage temporaire de connexion : après des mots de passe trop courts, le serveur refusait le bon mot de passe avec 429. La protection contre les tentatives répétées intervenait avant la validation des données. J’ai appliqué le correctif qui conserve la limite IP et place la validation avant le quota email. J’ai rejoué le scénario : les neuf mots de passe trop courts sont toujours refusés avec 400, puis le bon mot de passe est accepté avec 200. Le correctif bloque donc le scénario reproduit. Cette conclusion ne signifie pas que tout risque de blocage associé à une politique anti-bruteforce a disparu.

Référence générale : [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), compromis entre verrouillage de compte et déni de service. La preuve propre au projet est le test lié ci-dessus.

## Bilan provisoire

Complément de non-régression préparé pour VULN-002 : tests/audit-login-quota.test.mjs vérifie maintenant aussi le quota sur les mots de passe de forme valide (huit refus 401, puis un refus 429 attendu). Son exécution personnelle a réussi le 17 novembre 2026 à 12:52:01 UTC, avec une preuve brute conservée et liée dans la fiche. Le test attend le comportement corrigé par défaut et est ajouté à la suite PostgreSQL, qui comporte désormais six scénarios ; le résultat personnel précédent de cinq succès reste celui de la suite antérieure, sans modification de sa preuve.

### Non-régression exécutée par l'élève après les corrections

Le 17 novembre 2026, l'élève a lancé `npm.cmd test` : la capture fournie montre 21 tests réussis, 0 échec et 6 scénarios PostgreSQL ignorés. Cette exécution n'avait pas été redirigée vers un fichier texte ; elle est attestée ici par la capture partagée, sans fabrication d'une sortie brute.

L'élève a ensuite lancé `npm.cmd run test:db` avec enregistrement automatique : [preuve PostgreSQL](audit/preuves/non-regression-postgresql-eleve.txt). Résultat : 5 scénarios exécutés, 5 réussis, 0 échec et 0 scénario ignoré. Ils couvrent les parcours IA simulés, VULN-001, la pagination et l'audit, l'authentification et les rôles, puis les réinitialisations et changements de statut. Le mode fixed de VULN-001 apparaît à 11:34:21 UTC dans cette trace. Les logs d'erreurs internes et d'envoi email correspondent à des pannes volontairement provoquées par les tests ; ils ne constituent pas des échecs de cette suite.

VULN-002 a été retestée séparément avec succès ; elle n'était pas incluse dans ces cinq scénarios. La limite IP sur les corps invalides est couverte par la suite HTTP. Le contrôle ciblé du quota email sur des mots de passe correctement formés a ensuite été exécuté séparément avec succès, comme décrit dans la fiche VULN-002. Ces résultats valident uniquement les cas exécutés, sans certifier l'absence d'autres vulnérabilités.

### État de VULN-002

La piste est désormais reproduite et devient VULN-002. La preuve personnelle avant correction est enregistrée. L’élève a exécuté le correctif et son retest ciblé, qui est réussi. Le contrôle complémentaire anti-bruteforce a également réussi. La suite précédente de cinq scénarios a réussi ; la suite étendue à six scénarios n’a pas encore été exécutée dans son ensemble.

Le retest personnel de VULN-001 a réussi : les opérations soumises après révocation sont refusées dans les six scénarios. Cette vérification ne suffit pas à déclarer l'application entièrement sécurisée. Les nouvelles failles ne seront ajoutées à ce rapport qu'avec leur scénario reproductible et leurs preuves.

La reproduction personnelle avant correction et le retest personnel après correction sont disponibles. Les traces initiales restent conservées séparément. Ce résultat est limité aux six variantes testées et ne prouve pas l'absence d'autres failles.

## Pièces à joindre au rendu

- Ce rapport : `docs/RAPPORT-AUDIT-SECURITE.md`.
- Les fichiers liés dans `docs/audit/preuves/`, à conserver avec leurs chemins pour que les liens du rapport fonctionnent.
- Le test reproductible : `tests/audit-invitations.test.mjs`.
- Le code du projet contenant le correctif.

Le fichier LOT8 sert au suivi du travail. Le présent rapport rassemble la fiche technique et son analyse écrite pour le rendu.

## Journal de préparation de la reproduction initiale

Le 17 novembre 2026, une copie isolée du commit ac4bb58 a été extraite par git archive dans work/audit-vuln001-before-ac4bb58. Le test actuel audit-invitations.test.mjs y a été copié. Le dossier work est ignoré par Git ; le projet actif corrigé n'est pas remplacé. Aucun fichier .env réel n'est copié. Après installation et compilation, l'élève a exécuté le scénario le 17 novembre 2026 à 10:34:16 UTC. [Preuve personnelle avant correction](audit/preuves/VULN-001-avant-eleve.txt) : trois créations HTTP 201, trois renvois HTTP 200, un code et un email simulé par variante, et activation/connexion du nouveau Super Admin confirmée. Le test contient 1 succès et 0 échec : en mode vulnerable, cela signifie que l'exploitation attendue est reproduite.
