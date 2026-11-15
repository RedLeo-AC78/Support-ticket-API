# Lot 6 — Tests, sécurité, pagination, audit et CI

## Ce qui existait et ce qui change

Les tests de connexion, de JWT, de rotation, d'invitation, de reset et de permissions existaient déjà. La gestion des erreurs était centralisée et plusieurs routes avaient des limites de débit. Ce lot complète ces protections et ajoute pagination, filtres, tri, audit, changement de rôle, contrat OpenAPI et CI.

Le code garde les couches du projet : route → contrôleur → service → dépôt/Prisma. Les paramètres de recherche sont validés dans `src/validators/list.validation.ts`, le contrat dans `src/docs/openapi.ts`, les tests dans `tests/`, la CI dans `.github/workflows/ci.yml`.

## 1. Pourquoi deux types de tests ?

Un test unitaire vérifie une petite règle sans serveur ni base. Exemple : `limit=101` doit être refusé, car une page ne peut dépasser 100 tickets. Le service tickets est aussi testé avec un faux dépôt pour vérifier que le propriétaire vient du compte connecté.

Un test d'intégration vérifie plusieurs composants ensemble : une vraie requête HTTP traverse Express, l'authentification, les permissions, le service et PostgreSQL. On vérifie notamment qu'un USER ne peut pas lire le ticket d'un autre, même en connaissant son identifiant.

```powershell
npm.cmd test
npm.cmd run test:db
```

La première commande compile puis lance 15 tests sans base ; les 3 scénarios PostgreSQL sont ignorés. La seconde lance ces 3 scénarios complets. Ils créent des schémas aléatoires, appliquent toutes les migrations et suppriment leurs schémas à la fin. Les emails sont simulés. Les logs d'erreurs provoquées volontairement sont attendus.

Nouveaux cas : pagination et tri stable, recherche et filtre sans fuite de tickets, champs de tri malveillants, doublons de paramètres, erreurs JSON, taille du corps, débit, changement de rôle, audit, révocation et rollback. Le test du dernier Super Admin couvre aussi une rétrogradation en concurrence avec une désactivation.

## 2. Pagination, filtrage et tri

```text
GET /tickets?page=1&limit=10&status=OPEN&search=ordinateur&sortBy=createdAt&order=desc
```

| Paramètre | Fonction | Valeurs |
|---|---|---|
| page | Page demandée | 1 à 100000, défaut 1 |
| limit | Nombre maximum de tickets par page | 1 à 100, défaut 20 |
| status | Filtrer un statut | OPEN, IN_PROGRESS, RESOLVED, CLOSED |
| search | Rechercher dans titre et description | 1 à 150 caractères, sans distinction de casse |
| sortBy | Colonne de tri | id, createdAt, updatedAt, title, status ; défaut id |
| order | Sens du tri | asc ou desc ; défaut desc |

Prisma utilise `skip = (page - 1) * limit` et `take = limit`. Un second tri par identifiant départage les valeurs identiques. Le tri par statut suit l'ordre de l'enum PostgreSQL. La recherche utilise `contains` : les caractères `%` et `_` gardent leur signification de motifs SQL LIKE ; ce n'est pas une injection SQL.

Les règles d'accès sont toujours combinées avec les filtres via AND. Le total ne compte que les tickets autorisés. Le comptage et la page sont lus dans une transaction RepeatableRead, pour partager le même instantané. Entre deux requêtes, des créations peuvent néanmoins décaler les pages : une pagination par curseur serait plus adaptée à un gros flux.

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

**Changement de contrat** : GET /tickets et GET /users ne renvoient plus directement un tableau. Il faut lire `.data`. GET /users et GET /users/audit-logs acceptent seulement page et limit.

## 3. Erreurs et réponses cohérentes

Toutes les erreurs HTTP passent par `error-handler.ts` et suivent cette forme :

```json
{ "error": "Paramètre de recherche inconnu.", "code": "BAD_REQUEST", "status": 400 }
```

`error` aide l'humain, `code` est stable pour un client et `status` rappelle le statut HTTP. Les détails techniques et erreurs Prisma ne sont pas renvoyés. Les logs inattendus sont génériques pour éviter de révéler des secrets.

Les ressources seules restent des objets (ticket, compte de /auth/me). Toutes les listes suivent data/meta. Les opérations métier gardent leurs champs documentés : le login renvoie accessToken/refreshToken ; une invitation renvoie user/invitation. Un logout réussi renvoie 204 sans corps. Un format cohérent n'impose pas d'envelopper les tokens ou une réponse vide.

## 4. Limiter les abus et valider les entrées

Le limiteur global intervient avant la lecture du JSON : 300 requêtes/IP/minute, y compris les routes inconnues et la documentation. Les protections spécifiques restent : login 10/email/15 minutes, login/refresh/logout ensemble 30/IP/15 minutes, reset et invitations avec leurs propres quotas. Un dépassement du limiteur HTTP renvoie 429 et Retry-After en secondes.

Les compteurs expirent et la mémoire est bornée. Cela freine les abus mais ne remplace pas une protection réseau contre le DDoS. Ils sont propres à une instance et remis à zéro au redémarrage. Plusieurs serveurs nécessiteraient un stockage partagé. Ne pas activer aveuglément trust proxy : sinon une IP déclarée par le client peut fausser la protection. Une IP partagée à l'école partage aussi les quotas.

TypeScript ne valide pas les données reçues sur le réseau : le serveur vérifie encore types, longueurs, IDs, enums, mots de passe, tokens, paramètres de tri et pagination. Les champs inconnus des corps d'authentification et de gestion de comptes sont refusés. La création d'un ticket ne copie que title/description : les champs supplémentaires, dont ownerId/status, ne permettent pas de modifier le propriétaire ou le statut initial. Le PATCH de statut refuse les champs supplémentaires.

Prisma transmet les valeurs comme paramètres SQL ; les colonnes de tri sont choisies dans une liste autorisée. On ne construit pas une commande SQL à partir d'une saisie. Les rares appels SQL bruts applicatifs sont des constantes de verrouillage. Les appels Unsafe des tests utilisent uniquement des noms de schémas générés par le test et des migrations du dépôt, jamais des entrées HTTP.

## 5. Audit et changement de rôle

La table AuditLog enregistre : identifiant de l'acteur, identifiant de la cible, action, ancienne/nouvelle valeur et date. Aucun mot de passe, token, contenu d'email ou corps HTTP n'est enregistré.

Actions : USER_INVITED, INVITATION_REISSUED, INVITATION_ACCEPTED, PASSWORD_RESET, USER_ROLE_CHANGED, USER_STATUS_CHANGED. L'acteur d'une acceptation ou d'un reset est le compte ayant présenté le code secret. L'audit trace les opérations réussies ; une invitation enregistrée ne prouve pas la livraison de l'email. Les tentatives refusées ne sont pas historisées dans cette table.

```text
PATCH /users/3/role
{ "role": "AGENT" }
```

Seul SUPER_ADMIN peut changer un rôle. Les sessions et codes du compte sont révoqués ; une reconnexion est nécessaire. Si le compte attend encore son activation, renvoyer une invitation après le changement. Le dernier Super Admin actif ne peut être désactivé ni rétrogradé, même avec des demandes concurrentes.

La modification et son audit sont dans **la même transaction** : tout réussit, ou tout est annulé. Un test impose un échec d'écriture du journal et vérifie que ni le rôle ni les sessions ne changent.

```text
GET /users/audit-logs?page=1&limit=20
```

La lecture est réservée au SUPER_ADMIN. Aucune route ne permet de modifier ou supprimer ces journaux. Un administrateur PostgreSQL peut néanmoins les modifier : ce n'est pas un journal immuable. En production, il faudrait définir rétention, accès restreints et export protégé. Les actions précédant cette migration ne sont pas reconstituées.

## 6. OpenAPI

Ouvrir [le contrat local](http://localhost:3000/openapi.json) après redémarrage. Ce JSON décrit les 17 opérations métier : méthodes, URLs, champs, schémas de réponse, erreurs et authentification Bearer JWT. Il est public et ne contient aucun secret.

OpenAPI est le format du contrat ; Swagger est un ensemble d'outils capables de l'afficher. Le projet fournit le contrat, sans embarquer Swagger UI. Pour l'afficher dans un outil compatible, télécharger le JSON :

```powershell
Invoke-WebRequest "http://localhost:3000/openapi.json" -OutFile "$env:TEMP\support-ticket-openapi.json"
```

Importer ce fichier dans Swagger Editor ou un client API compatible. Pour les appels locaux, PowerShell reste utilisable : un outil web externe peut être bloqué par les règles CORS de son navigateur. Le contrat doit évoluer avec le code ; le test vérifie les références internes et les déclarations principales, pas une conformité exhaustive de toutes les réponses au schéma.

Référence du format : [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3).

## 7. CI GitHub Actions

Le workflow se déclenche à chaque push et pull request, sur toutes les branches. GitHub installe Node 22, lance PostgreSQL 16 temporaire, installe les versions de package-lock avec npm ci, vérifie la mise en forme, compile et lance les tests sans base puis les tests PostgreSQL.

Il n'utilise ni ton fichier .env, ni ta clé Brevo, ni ta base personnelle. Les identifiants test/test appartiennent seulement au service PostgreSQL éphémère du job. Aucun email réel n'est envoyé. Les permissions GitHub sont limitées à la lecture du dépôt.

Après ton commit et ton push, ouvrir l'onglet Actions du dépôt pour voir le résultat. Le workflow n'a pas encore été exécuté sur GitHub depuis ces changements locaux. Un échec rend le contrôle rouge ; empêcher une fusion malgré cet échec exige une règle de protection de branche, qui n'est pas configurée par ce fichier.

Référence : [services PostgreSQL dans GitHub Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

## 8. Démonstration courte après redémarrage

Les commandes supposent des headers Bearer valides, comme dans les lots précédents. Ne pas utiliser les vrais IDs d'un autre compte pour modifier son rôle pendant une démonstration sans le prévoir.

```powershell
# Utilisateur connecté : seulement ses propres tickets.
$page = Invoke-RestMethod "http://localhost:3000/tickets?page=1&limit=2&status=OPEN&sortBy=createdAt&order=desc" -Headers $headersUser
$page.data | Format-Table
$page.meta | Format-List

# Validation : 400 attendu, aucune donnée modifiée.
Invoke-RestMethod "http://localhost:3000/tickets?limit=999" -Headers $headersUser

# Super Admin : consulter le journal.
$audit = Invoke-RestMethod "http://localhost:3000/users/audit-logs?limit=5" -Headers $headersAdmin
$audit.data | Format-Table

# Utilisateur simple : 403 attendu.
Invoke-RestMethod "http://localhost:3000/users/audit-logs" -Headers $headersUser
```

À expliquer au professeur : « Je valide les paramètres, puis j'applique les droits avant de paginer. Les erreurs ont un contrat commun. Les actions sensibles et leur audit sont atomiques. Les tests vérifient les succès, les refus et les échecs ; la CI les rejoue sur chaque push. »

Pour une autre installation ou après récupération du commit : arrêter le serveur, lancer npm.cmd run db:migrate, npm.cmd run build puis npm.cmd start. La migration ajoute la table d'audit, sans effacer les comptes ni les tickets. Faire le commit une fois les changements relus.
