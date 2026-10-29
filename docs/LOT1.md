# Lot 1 — Comptes, mots de passe et premier Super Admin

## Objectif

Le premier lot prépare les données nécessaires à l'authentification et permet de créer le premier Super Admin. Sans ce premier compte, personne ne pourrait inviter les autres utilisateurs, puisque le projet n'autorise pas l'inscription publique.

Ce guide décrit les fondations, avec les ajustements apportés après réception des consignes détaillées du professeur. Les routes de connexion sont expliquées au [lot 2](LOT2.md), les invitations au [lot 3](LOT3.md) et les resets au [lot 4](LOT4.md).

**Si votre Super Admin existe déjà, ne recommencez pas sa création.** Ce document sert aussi à expliquer le projet et à installer une nouvelle copie sur un autre ordinateur.

## 1. Comprendre les outils

| Outil | Rôle dans le projet |
|---|---|
| Node.js | Exécute le serveur JavaScript |
| Express | Reçoit les requêtes HTTP et renvoie les réponses JSON |
| TypeScript | Vérifie les types avant compilation en JavaScript |
| PostgreSQL | Conserve les comptes, tickets et sessions |
| Prisma | Décrit les modèles et permet au code de lire ou modifier la base |
| pgAdmin | Interface graphique pour administrer PostgreSQL ; ce n'est pas le serveur API |

`prisma/schema.prisma` décrit la structure souhaitée. Les fichiers SQL dans `prisma/migrations/` enregistrent les changements de structure. Appliquer une migration crée ou modifie les tables ; générer le client Prisma crée le code utilisé par l'application. Ce sont deux opérations différentes.

## 2. Préparer la base et la configuration

Pour une nouvelle installation : installer Node.js compatible avec le projet et PostgreSQL, puis ouvrir le dossier `support-ticket` dans VS Code. Dans pgAdmin, créer une base nommée `support_ticket`.

Dans le terminal du projet :

```powershell
npm.cmd install
```

Seulement si `.env` n'existe pas encore :

```powershell
Copy-Item .env.example .env
```

Modifier la connexion dans `.env` avec les identifiants PostgreSQL locaux :

```env
DATABASE_URL="postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/support_ticket"
PORT=3000
```

Conserver les autres variables si le projet est déjà configuré. Ne pas remplacer un fichier `.env` existant par l'exemple : cela ferait perdre sa configuration locale. Les caractères spéciaux du mot de passe doivent être encodés dans l'URL, par exemple `@` devient `%40`.

Le mot de passe PostgreSQL permet au serveur de joindre la base. Il est différent du mot de passe du Super Admin, qui sert à se connecter à l'API. `.env` contient des secrets et est exclu de Git ; `.env.example` contient uniquement des exemples partageables.

## 3. Appliquer les migrations

```powershell
npm.cmd run db:migrate
```

Cette commande applique les migrations qui ne l'ont pas encore été. Les migrations de ce lot ajoutent les comptes, sessions, invitations, resets et le propriétaire des tickets. Les tickets existants sont conservés.

Ne pas modifier une ancienne migration déjà appliquée : ajouter une nouvelle migration permet de garder un historique cohérent entre les ordinateurs du groupe.

## 4. Comprendre les modèles

| Modèle | Données et utilité |
|---|---|
| User | Email unique, empreinte du mot de passe, rôle et état du compte |
| Ticket | Demande d'assistance, statut, dates et propriétaire |
| Session | Connexion d'un compte, expiration et révocation |
| RefreshToken | Empreintes des tokens de renouvellement et trace de leur utilisation |
| Invitation | Empreinte d'un code d'activation avec expiration |
| PasswordReset | Empreinte d'un code de réinitialisation avec expiration |

`Ticket.ownerId` peut être vide pour préserver les tickets créés avant l'authentification. L'API actuelle impose le compte connecté comme propriétaire des nouveaux tickets. Les anciens tickets sans propriétaire restent visibles aux ADMIN et SUPER_ADMIN.

### Rôles et états : deux notions différentes

Le **rôle** décrit ce qu'un compte a le droit de faire :

- `SUPER_ADMIN` : invite les comptes et gère leur activation/désactivation.
- `ADMIN` : consulte les comptes et traite les tickets.
- `AGENT` : traite les tickets ayant un propriétaire.
- `USER` : crée et consulte ses propres tickets.

La matrice complète est dans [CONSIGNES.md](CONSIGNES.md) et sa politique est codée dans `src/permissions.ts`. Les middlewares ajoutés au lot 2 appliquent ces droits aux requêtes.

L'**état** décrit si le compte peut se connecter :

- `INVITED` : invitation en attente, aucun mot de passe encore choisi.
- `ACTIVE` : compte activé, autorisé à se connecter.
- `DISABLED` : compte désactivé, accès refusé.

Un compte invité a un `passwordHash` vide. Le destinataire choisit son mot de passe lors de l'acceptation : l'administrateur ne le définit pas à sa place.

## 5. Créer le premier Super Admin

Dans un terminal interactif du projet :

```powershell
npm.cmd run admin:create
```

La commande compile le projet puis demande :

1. L'email du premier Super Admin.
2. Un mot de passe de 15 à 128 caractères.
3. Le même mot de passe pour confirmation.

La saisie est masquée : aucun caractère n'apparaît dans ce script, c'est normal. Une réussite affiche « Super administrateur créé ». Le compte est créé directement avec le rôle SUPER_ADMIN et l'état ACTIVE.

Le script `src/create-admin.ts` est une exception locale pour démarrer l'application. Il ne fournit aucun mot de passe par défaut et n'expose aucune route publique de création de Super Admin. Il refuse de modifier un compte déjà existant et refuse de créer un deuxième compte si un SUPER_ADMIN existe déjà. Les créations suivantes passent par les invitations du lot 3.

Un verrou PostgreSQL empêche deux exécutions simultanées du script de créer chacune un premier Super Admin. La création se fait dans une transaction : une erreur annule les opérations de cette transaction.

## 6. Pourquoi hacher les mots de passe ?

La base ne conserve pas le mot de passe en clair. `src/security.ts` utilise `scrypt`, fourni par `node:crypto`, pour produire une empreinte à partir du mot de passe et d'un sel aléatoire propre au compte.

Le sel fait que deux personnes ayant le même mot de passe n'ont pas la même empreinte. Il n'est pas secret : il est conservé avec l'empreinte. Les réglages du projet sont N=131072, r=8, p=1, avec un sel de 16 octets. Le coût mémoire est d'environ 128 Mio par calcul ; les routes limitent donc les calculs simultanés.

À la connexion, le serveur recalcule l'empreinte de la saisie et compare les résultats avec `timingSafeEqual`. Il ne déchiffre pas un ancien mot de passe. La réinitialisation consiste à remplacer son empreinte, pas à retrouver le mot de passe oublié.

Les phrases longues et les espaces sont acceptés. Les mots de passe ne sont pas tronqués ni nettoyés avec `trim()`. Éviter de réutiliser un mot de passe personnel pour les démonstrations.

## 7. Vérifier et continuer

```powershell
npm.cmd test
```

Les tests de sécurité vérifient notamment qu'un même mot de passe produit deux empreintes différentes avec deux sels, qu'un mot de passe incorrect est refusé et que les espaces sont préservés. Ils ne créent pas de compte réel.

Pour démarrer la version actuelle avec ses routes protégées, continuer avec [LOT2.md](LOT2.md) : génération de la clé JWT, lancement du serveur et première connexion. La création du Super Admin ne connecte pas automatiquement le navigateur.

### Problèmes fréquents

| Message ou situation | Action |
|---|---|
| Connection url is empty | Vérifier DATABASE_URL dans `.env`, au même niveau que package.json |
| Connexion PostgreSQL refusée | Vérifier que PostgreSQL tourne et que le port et les identifiants sont corrects |
| Table User introuvable | Appliquer `npm.cmd run db:migrate` |
| Un super administrateur existe déjà | Utiliser ce compte ; ne pas tenter de le recréer |
| Aucun caractère pendant la saisie du mot de passe | Saisie masquée normale |

Ce guide n'impose pas de refaire les étapes déjà réalisées ni de recréer la base. Il complète la documentation du lot 1 sans modifier le fonctionnement de l'application.
