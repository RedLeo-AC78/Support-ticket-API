# Lot 8 — Audit de cybersécurité scolaire

Date : 17 novembre 2026. Version de départ : commit `ac4bb58` sur develop.

Le document destiné au rendu écrit est [RAPPORT-AUDIT-SECURITE.md](RAPPORT-AUDIT-SECURITE.md). Il rassemble les fiches et leurs analyses rédigées ; ce LOT8 reste le suivi pédagogique de l'audit.

Copie avant correction préparée le 17 novembre : work/audit-vuln001-before-ac4bb58 (extraction git archive de ac4bb58 et copie du test ciblé). Aucun .env copié et aucune exploitation exécutée lors de cette préparation. Installation, compilation et reproduction personnelle réalisées ensuite ; preuve dans audit/preuves/VULN-001-avant-eleve.txt (17 novembre, 10:34:16 UTC). Ne pas démarrer son serveur.

## Reprise pédagogique avec l'élève

À la lecture du sujet lors de cette reprise, cette fiche, le correctif et les fichiers de preuves ci-dessous étaient déjà présents dans le dossier de travail, non commités. Ils sont conservés. Leurs résultats sont distingués de l'exécution personnelle de l'élève, réalisée ensuite et décrite ci-dessous.

Nous avançons une faille à la fois : comprendre le scénario, exécuter la preuve, relever le résultat, expliquer la correction, puis retester avant de faire un commit. Les autres contrôles restent des pistes tant qu'ils ne disposent pas de preuves. Un test réussi ne suffit pas à déclarer l'application entièrement sécurisée.

Pour conserver la prochaine exécution personnelle, utiliser la commande ciblée ci-dessous en remplaçant sa ligne node par :

```powershell
node --env-file=.env --test tests/audit-invitations.test.mjs 2>&1 |
    Tee-Object -FilePath docs/audit/preuves/VULN-001-retest-eleve.txt
```

Statut de cette preuve personnelle : **retest exécuté par l'élève et réussi** le 17 novembre 2026 à 09:58:34 UTC (10:58:34 à Paris). [Sortie conservée](audit/preuves/VULN-001-retest-eleve.txt), vérifiée et accompagnée d'une capture transmise par l'élève : mode fixed, 1 test réussi, 0 échec et six réponses HTTP 403. Pour chaque cas : activeCodes=0, emailsCaptured=0, auditWrites=0. destinationExists=true dans les cas resend est normal : le destinataire existait déjà avant la tentative. L'empreinte du service correspond au correctif décrit dans la fiche. Cette exécution confirme le blocage des scénarios testés après correction ; elle n'est pas une nouvelle exploitation de l'ancienne version.

La sortie brute contient des caractères d'affichage mal décodés par le terminal (accents et symboles du rapporteur Node). Les champs JSON et résultats numériques restent lisibles. Le fichier original est conservé sans réécriture pour ne pas modifier la preuve.

## Objectif et consignes du professeur

Le sujet fourni, « Audit de sécurité et tests d'intrusion », demande de démontrer une vulnérabilité, la corriger et rejouer le scénario. Une simple liste de risques ne suffit pas. Chaque vulnérabilité confirmée possède donc une fiche séparée, avec les dix rubriques imposées, le test et ses résultats avant/après.

Ce dossier documente un audit pédagogique local avec accès au code. Il ne certifie pas l'absence de toute vulnérabilité. Il ne s'agit pas d'un audit d'une infrastructure de production.

## Périmètre et méthode

- API Express, sessions, permissions, invitations, tickets et assistance IA : lecture des composants concernés et tests automatisés du dépôt.
- Requêtes HTTP réelles sur un serveur éphémère lié à 127.0.0.1 ; PostgreSQL réel dans des schémas temporaires aléatoires.
- Comptes et mots de passe fictifs. Les emails sont capturés en mémoire ; OpenAI est simulé ou désactivé.
- Aucun test d'intrusion contre GitHub, Brevo, OpenAI, le réseau de l'école ou les comptes réels. Aucun appel IA payant.
- L'audit de dépendances, l'infrastructure réseau, TLS et un test de charge ne sont pas couverts par cette étape. La robustesse du vrai modèle aux prompts malveillants n'est pas établie par les tests simulés.

Le test `tests/audit-invitations.test.mjs` était déjà présent mais non commité au début de cette session. Il a été lu, exécuté avant modification puis intégré à la suite de non-régression. Il n'est pas présenté comme une preuve antérieure à son exécution.

## Résultat de cette étape

| Identifiant | Résultat | Criticité contextualisée | Fiche |
|---|---|---|---|
| VULN-001 | Exploitation reproduite, correction et retest réussis | Élevée : création d'un nouveau Super Admin possible après révocation du créateur | [Fiche technique](audit/VULN-001.md) |

La condition importante est la concurrence : une requête **déjà autorisée** continue pendant qu'une autre requête retire les droits de son auteur. Une nouvelle requête faite après la révocation était bien refusée ; c'est la requête en cours qui posait problème.

Avant correction : 6 cas autorisés à tort, dont un scénario complet d'activation et de connexion du nouveau Super Admin. Après correction : 6 refus HTTP 403 ; aucun nouveau code, aucun email capturé, aucune écriture d'audit d'invitation. Dans les tests de renvoi, le destinataire préexiste et reste en INVITED.

## Vérifications effectuées et limites des conclusions

| Contrôle | Preuve exécutée | Conclusion limitée aux scénarios |
|---|---|---|
| Accès anonyme et faux JWT | api.test, jwt.test | Refus d'accès ; signature, expiration, audience et émetteur contrôlés |
| Droits et propriété | permissions.test, postgres.test | USER ne peut pas lire un ticket appartenant à un autre ni modifier son statut ; rôle AGENT limité |
| Injection SQL et paramètres | hardening-postgres.test, hardening.test | Payload de recherche sans élargissement des résultats ; colonne de tri malveillante refusée ; table conservée |
| Validation et erreurs | hardening.test | JSON invalide, taille, pagination invalide et détails d'erreur interne contrôlés |
| Force brute et débit | hardening.test, reset-postgres.test | Limites IP/email et code 429 observés ; ce n'est pas un test de DDoS distribué |
| Rotation et révocation | postgres.test | Rejeu du refresh token et usages concurrents refusés ; session révoquée |
| Invitations et reset | postgres.test, reset-postgres.test | Codes expirés, à usage unique et concurrents contrôlés ; emails simulés |
| Dernier Super Admin | hardening-postgres.test, reset-postgres.test | Désactivation/rétrogradation concurrentes ne retirent pas tous les Super Admin actifs |
| Audit atomique | hardening-postgres.test, ai-postgres.test | Un échec provoqué du journal annule la modification associée |
| Assistance IA | ai.test, ai-postgres.test | Pas d'outil fourni au modèle ; validation de sortie, propriété et concurrence testées avec fournisseur simulé |
| Révocation pendant une invitation | audit-invitations.test | VULN-001 démontrée puis bloquée après correction |

Un contrôle réussi ne prouve pas qu'aucune autre variante ne fonctionne. Les limites mémoire des quotas, la conservation des journaux et les erreurs possibles du classement IA restent des choix/limites documentés dans les lots précédents ; ils ne sont pas transformés ici en failles « exploitées » sans preuve.

## Preuves et commandes

Mise à jour après VULN-002 : l'élève a exécuté la suite sans base (21 succès, 0 échec, 6 scénarios DB ignorés, preuve par capture), puis la suite PostgreSQL (5 succès, 0 échec, 0 scénario ignoré). [Sortie PostgreSQL personnelle](audit/preuves/non-regression-postgresql-eleve.txt). VULN-002 reste un retest ciblé séparé de cette suite. Le rapport principal précise les contrôles complémentaires encore en attente.

- [Exploitation avant correction](audit/preuves/VULN-001-avant.txt)
- [Retest après correction](audit/preuves/VULN-001-apres.txt)
- [Tests unitaires et HTTP](audit/preuves/tests-unitaires-http.txt)
- [Tests PostgreSQL](audit/preuves/tests-postgresql.txt)
- [Source du service avant correction](audit/preuves/VULN-001-service-avant.txt)

Les sorties sont enregistrées pendant l'exécution, avec version Node, date UTC et empreinte SHA-256 du service pour le test ciblé. Elles ne contiennent ni clé réelle ni token. La copie du source vulnérable est une preuve, pas un fichier importé par le serveur.

Depuis le dossier support-ticket :

```powershell
npm.cmd test
npm.cmd run test:db
```

Résultat au moment de cet audit : 21 tests sans base réussis (5 scénarios DB ignorés dans cette commande), puis 5 scénarios PostgreSQL réussis avec de nombreuses assertions. Des erreurs internes et email sont volontairement provoquées pour vérifier les pannes ; leurs logs génériques sont attendus. La CI lancera aussi le nouveau test sur le prochain push ; elle n'a pas encore validé ce changement sur GitHub.

Rejouer seulement VULN-001 sur le code corrigé :

```powershell
npm.cmd run build
$env:RUN_DB_TESTS = '1'
$env:AUDIT_EXPECT = 'fixed'
try {
    node --env-file=.env --test tests/audit-invitations.test.mjs
} finally {
    Remove-Item Env:RUN_DB_TESTS, Env:AUDIT_EXPECT -ErrorAction SilentlyContinue
}
```

DATABASE_URL doit viser une base locale de développement dont le compte peut créer et supprimer des schémas. Le test ne supprime que son schéma aléatoire. Il ne dépend pas des comptes du projet.

## Comprendre et présenter le travail

1. Lire la fiche VULN-001, notamment les conditions nécessaires : ancien Super Admin connecté et requête déjà en cours.
2. Comparer un extrait avant/après : auparavant les droits n'étaient contrôlés que par le middleware ; maintenant ils sont revérifiés sous verrou dans la transaction.
3. Exécuter le retest local et expliquer les six lignes HTTP 403. Le mode vulnerable sert à constater la faille sur l'ancienne version, pas à valider le code corrigé.
4. Montrer que les tests habituels passent encore : corriger la faille ne doit pas casser les invitations légitimes.

Le programme réalise les tests, mais l'élève doit pouvoir expliquer la chronologie, les résultats et la correction. Une sortie générée ne remplace pas cette compréhension. Nous pouvons reprendre cette fiche ensemble, étape par étape, avant le commit.

## Ce qui change dans le projet

- Nouveau helper `repositories/invitation-authorization.ts` : verrouillage ordonné et relecture de l'acteur et de sa session.
- `invitations.service.ts` : contrôle à l'intérieur des transactions create/resend avant toute écriture.
- `users.controller.ts` : transmission de l'identifiant de session, fourni par le middleware et jamais choisi dans le corps JSON.
- `scripts/test-db.mjs` : ajout du test d'audit à la CI et aux tests DB.
- Aucun changement de schéma, de rôle ou d'URL ; pas de migration nécessaire.

Pour utiliser le correctif local, arrêter le serveur puis lancer `npm.cmd run build` et `npm.cmd start`. Aucun commit ni push n'est effectué pour cette étape.
