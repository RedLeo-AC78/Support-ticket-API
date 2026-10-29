# Support Ticket — projet de classe
*Groupe : Adam Cheria / Jacques OWONE*

> Extension authentification en cours, par lots : le lot 1 ajoute les modèles de comptes et le script de création du premier super administrateur. Les routes de tickets restent publiques jusqu'au lot 2. Voir [le guide pédagogique](docs/AUTHENTIFICATION.md) pour la migration et les explications.

API REST en **Node.js, Express, TypeScript et PostgreSQL avec Prisma**. Pas de framework frontend ni de bibliothèque de validation. L'adaptateur `@prisma/adapter-pg` relie Prisma 7 à PostgreSQL. Les tests utilisent le module intégré `node:test`.

## Installation

Prérequis : Node.js 22.12+ (ou version ultérieure compatible avec Prisma 7), npm et un serveur PostgreSQL en fonctionnement.

Dans ce dossier :

```powershell
npm install
Copy-Item .env.example .env
```

Créer une base `support_ticket` avec votre outil PostgreSQL, par exemple dans psql :

```sql
CREATE DATABASE support_ticket;
```

Modifier `DATABASE_URL` dans `.env` avec votre utilisateur, mot de passe, hôte et port PostgreSQL. Encoder les caractères spéciaux du mot de passe dans l'URL. Puis :

```powershell
npm run db:migrate
npm run build
npm start
```

L'API écoute sur `http://localhost:3000`. `PORT` est configurable dans `.env`.

Pendant le développement, `npm run dev` compile puis surveille le JavaScript compilé. Après une modification TypeScript, exécuter `npm run build` dans un second terminal pour recompiler et déclencher le redémarrage. Après une modification du schéma, utiliser `npm run db:dev -- --name description_du_changement`, puis recompiler.

## Routes

| Méthode | URL | Rôle | Succès |
|---|---|---|---|
| POST | `/tickets` | Créer un ticket | 201 |
| GET | `/tickets` | Lister tous les tickets, plus récents en premier | 200 |
| GET | `/tickets/:id` | Récupérer un ticket par ID | 200 |
| PATCH | `/tickets/:id/status` | Modifier son statut | 200 |

Création : `title` (1–150 caractères) et `description` (1–5000 caractères) sont obligatoires. Les espaces de début et de fin sont supprimés. Le statut initial est toujours `OPEN`. Les propriétés supplémentaires ne sont pas enregistrées.

Statuts : `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`. Toute transition entre ces statuts est autorisée, y compris la réouverture. Un ticket possède aussi `id`, `createdAt` et `updatedAt`, gérés par PostgreSQL/Prisma.

Exemples PowerShell :

```powershell
$ticket = Invoke-RestMethod -Method Post -Uri http://localhost:3000/tickets -ContentType 'application/json' -Body '{"title":"Connexion impossible","description":"Je ne peux pas acceder a mon compte."}'
Invoke-RestMethod http://localhost:3000/tickets
Invoke-RestMethod "http://localhost:3000/tickets/$($ticket.id)"
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/tickets/$($ticket.id)/status" -ContentType 'application/json' -Body '{"status":"IN_PROGRESS"}'
```

Les erreurs sont renvoyées en JSON : `{"error":"Ticket introuvable."}`. Codes : `400` (entrée invalide), `404` (ticket ou route introuvable), `413` (requête trop volumineuse), `500` (erreur interne).

## Structure et vérification

- `src/app.ts` : routes Express, validation et gestion centralisée des erreurs.
- `src/server.ts` : connexion Prisma/PostgreSQL et démarrage du serveur.
- `prisma/schema.prisma` : modèle de données.
- `prisma/migrations/` : migration SQL initiale versionnée.
- `tests/api.test.mjs` : tests HTTP avec dépôt simulé, sans base nécessaire.

```powershell
npm test
```

Les tests vérifient les quatre opérations, les statuts et les erreurs de saisie. Ils ne remplacent pas un test PostgreSQL : après migration, exécuter les exemples ci-dessus, redémarrer le serveur puis relire le ticket pour vérifier la persistance.

Le périmètre est celui du devoir : API sans interface graphique, authentification ni suppression. La liste est complète et non paginée, adaptée à un petit projet de classe.

Référence technique : [configuration du client Prisma](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/introduction).
