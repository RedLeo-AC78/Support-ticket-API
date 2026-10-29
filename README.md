# Support Ticket — projet de classe
*Groupe : Adam Cheria / Jacques OWONE*

API REST de support en **Node.js, Express, TypeScript et PostgreSQL avec Prisma**. Elle gère les tickets, les comptes sur invitation, les quatre rôles, les sessions JWT et la récupération des mots de passe. Aucune inscription publique ni interface graphique.

`jose` signe et vérifie les JWT ; `node:crypto` protège les mots de passe et génère les codes. Brevo envoie les emails via `fetch`, intégré à Node.js. Les tests utilisent `node:test`.

## Installation sur une nouvelle machine

Prérequis : Node.js compatible avec Prisma 7 (22.12+ dans la branche 22), npm et PostgreSQL en fonctionnement. Créer une base `support_ticket`, par exemple dans pgAdmin.

Dans le dossier du projet :

```powershell
npm.cmd ci
```

Uniquement si `.env` n'existe pas encore :

```powershell
Copy-Item .env.example .env
```

Renseigner DATABASE_URL dans `.env` avec les identifiants PostgreSQL. Ne jamais publier ce fichier. Puis :

```powershell
npm.cmd run db:migrate
npm.cmd run auth:setup
npm.cmd run admin:create
npm.cmd run build
npm.cmd start
```

`admin:create` sert uniquement au premier Super Admin ; sauter cette commande si le compte existe déjà. L'API écoute sur `http://localhost:3000`, configurable avec PORT. Un navigateur ouvrant directement `/tickets` reçoit 401 : il faut joindre un access token.

Pour envoyer réellement des emails, configurer Brevo selon [LOT3.md](docs/LOT3.md). Sans configuration, le mode local écrit des emails de test dans `work/mail-outbox` ; il n'envoie rien.

## Guides

| Guide | Contenu |
|---|---|
| [Lot 1](docs/LOT1.md) | Installation, modèles, hachage, premier Super Admin |
| [Lot 2](docs/LOT2.md) | Connexion, JWT, refresh, déconnexion et tickets |
| [Lot 3](docs/LOT3.md) | Invitations, acceptation et configuration Brevo |
| [Lot 4](docs/LOT4.md) | Désactivation/réactivation et reset par email |
| [Lot 5](docs/LOT5.md) | Revue finale, démonstration et préparation de l'oral |
| [Consignes](docs/CONSIGNES.md) | Correspondance des exigences et permissions |
| [Authentification](docs/AUTHENTIFICATION.md) | Vue d'ensemble des parcours et protections |

## Routes

| Méthode | URL | Accès / fonction |
|---|---|---|
| POST | `/auth/login` | Email et mot de passe d'un compte actif |
| POST | `/auth/refresh` | Refresh token ; rotation des deux tokens |
| POST | `/auth/logout` | Refresh token ; révocation de sa session |
| GET | `/auth/me` | Access token ; compte connecté sans secrets |
| POST | `/users` | SUPER_ADMIN ; création et invitation |
| GET | `/users` | SUPER_ADMIN ou ADMIN ; liste sans secrets |
| POST | `/users/:id/invitation` | SUPER_ADMIN ; renvoi d'invitation |
| POST | `/auth/accept-invitation` | Code valide ; choix du mot de passe |
| PATCH | `/users/:id/status` | SUPER_ADMIN ; désactivation/réactivation |
| POST | `/auth/forgot-password` | Email ; réponse générique |
| POST | `/auth/reset-password` | Code valide et nouveau mot de passe |
| POST | `/tickets` | Compte connecté ; propriétaire imposé par le serveur |
| GET | `/tickets` | Tickets visibles selon le rôle, plus récents en premier |
| GET | `/tickets/:id` | Ticket visible selon le rôle et le propriétaire |
| PATCH | `/tickets/:id/status` | SUPER_ADMIN, ADMIN ou AGENT selon la visibilité |

Un USER voit seulement ses propres tickets. Un AGENT traite les tickets ayant un propriétaire ; ADMIN et SUPER_ADMIN voient aussi les tickets historiques sans propriétaire.

Les tickets demandent title (1–150 caractères) et description (1–5000 caractères), après suppression des espaces de début et fin. Leur statut initial est OPEN. Les statuts possibles sont OPEN, IN_PROGRESS, RESOLVED et CLOSED ; la réouverture est autorisée. Le client ne choisit pas ownerId.

Erreurs JSON : 400 saisie invalide, 401 authentification refusée, 403 permission insuffisante, 404 ressource absente ou non visible, 409 conflit, 413 requête trop volumineuse, 429 trop de tentatives, 500 erreur interne, 503 file email saturée.

## Tests et développement

```powershell
npm.cmd test
npm.cmd run test:db
```

La première commande compile et exécute les tests sans PostgreSQL ; les deux scénarios PostgreSQL sont ignorés dans cette commande. La seconde les exécute sur des schémas temporaires supprimés ensuite. Elle utilise DATABASE_URL et nécessite le droit de créer des schémas, mais ne modifie pas les comptes et tickets réels. Les emails sont simulés ; les messages d'échec email des scénarios de panne sont attendus.

`npm.cmd run dev` compile puis surveille le JavaScript compilé. Après une modification TypeScript, lancer `npm.cmd run build` dans un second terminal. Après un changement de schéma, créer une migration avec `npm.cmd run db:dev -- --name nom_du_changement`, puis recompiler.

Les migrations existantes sont versionnées et ne doivent pas être réécrites après application. Les secrets `.env`, dépendances, fichiers générés et emails locaux sont exclus de Git.

## Limites du projet

API de classe, sans interface graphique ni suppression. Listes non paginées, limites de débit et file email en mémoire pour une instance, pas de nettoyage périodique des sessions expirées. Une mise en production demanderait notamment HTTPS, une file email durable, supervision, sauvegardes et une stratégie adaptée aux cookies si une interface navigateur est ajoutée. Voir les détails pédagogiques des lots 2 à 5.
