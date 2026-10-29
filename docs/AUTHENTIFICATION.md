# Authentification — progression par commits

## Lot 1 : modèles, mots de passe et premier super administrateur

Le lot 1 prépare les données. Le lot 2 est maintenant implémenté : connexion JWT, rotation, déconnexion et protection des tickets. Voir [LOT2.md](LOT2.md) pour le lancement et les exemples. Les emails et invitations ne sont pas encore activés. Les descriptions au futur ci-dessous expliquent la conception initiale et les lots restants.

### Pourquoi ces tables ?

| Table | Utilité |
|---|---|
| User | Email unique, empreinte du mot de passe, rôle |
| Session | Expiration et révocation d'une connexion ; empreinte de l'access token |
| RefreshToken | Historique des renouvellements pour détecter une réutilisation |
| PasswordReset | Empreinte d'un code temporaire de réinitialisation |
| Invitation | Empreinte d'un code d'invitation temporaire à usage unique |

`Ticket.ownerId` est nullable pour préserver les tickets déjà créés. La future API associera chaque nouveau ticket au compte connecté. Les tickets historiques sans propriétaire seront réservés aux administrateurs.

Les rôles sont USER, AGENT, ADMIN et SUPER_ADMIN. Seul SUPER_ADMIN créera les comptes, par invitation au lot 3. ADMIN ne crée donc pas d'utilisateurs. La politique centralisée dans `src/permissions.ts` est appliquée aux routes du lot 2. Voir [le suivi des consignes](CONSIGNES.md) pour la matrice des droits.

Un compte invité possède un email et un rôle, mais aucun mot de passe : `passwordHash` est nullable. Il passe de INVITED à ACTIVE quand le destinataire accepte son invitation et choisit son mot de passe. DISABLED interdit connexion et utilisation des tokens. Réactiver un compte ne devra pas réactiver ses anciennes sessions. Un compte sans mot de passe doit revenir à INVITED, jamais directement à ACTIVE.

### Mot de passe : hachage, pas chiffrement

Un chiffrement se déchiffre avec une clé. Un hachage de mot de passe sert à vérifier une saisie sans retrouver le mot de passe original. Le module natif `node:crypto` fournit `scrypt` : ici N=131072, r=8, p=1, avec un sel aléatoire de 16 octets par mot de passe. Le sel empêche deux comptes ayant le même mot de passe d'avoir la même empreinte. Il n'est pas secret et est enregistré avec l'empreinte.

Le coût en mémoire rend les essais massifs plus coûteux. Ces réglages consomment environ 128 Mio par calcul : la concurrence devra être limitée et les ressources surveillées sur un serveur public. La comparaison utilise `timingSafeEqual`. Les mots de passe contiennent 15 à 128 caractères ; les phrases longues sont autorisées et les espaces sont conservés.

Référence : [OWASP — stockage des mots de passe](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

### Pourquoi deux tokens ? (lot suivant)

Conformément aux consignes détaillées, l'access token sera un JWT signé valable 15 minutes. Le refresh token sera aléatoire et opaque, avec une session limitée à 7 jours. Un JWT signé est lisible : il ne doit contenir aucun mot de passe ni secret. Le serveur devra vérifier signature, algorithme autorisé, expiration, émetteur et destinataire, puis contrôler la session et l'état actuel du compte en base. Un JWT encore valide ne doit pas permettre à un compte désactivé de continuer à agir.

L'empreinte du JWT pourra être conservée dans `Session.accessHash` pour invalider immédiatement l'ancien access token lors d'un renouvellement. SHA-256 convient aux refresh tokens aléatoires de 256 bits, mais pas aux mots de passe choisis par des humains. La signature JWT utilisera une bibliothèque spécialisée de l'écosystème Node.js ; ce choix évite d'écrire un vérificateur JWT artisanal et ne change pas la stack Express/TypeScript/PostgreSQL/Prisma.

Un refresh token sera remplacé à chaque utilisation. La réutilisation d'un ancien refresh token révoquera la session concernée. Le client devra éviter deux renouvellements simultanés. Un reset de mot de passe révoquera toutes les sessions du compte.

Références : [OWASP — renouvellement des tokens](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html), [OWASP — mot de passe oublié](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

### Appliquer le lot 1

Dans le dossier du projet, après avoir configuré `.env` :

```powershell
npm.cmd run db:migrate
npm.cmd run admin:create
```

La seconde commande demande l'email puis le mot de passe deux fois. La saisie du mot de passe est masquée : aucun caractère n'apparaît, c'est normal. N'utilisez pas votre mot de passe personnel comme mot de passe de démonstration. Aucun identifiant par défaut n'est livré. La commande refuse de modifier un utilisateur existant et refuse de créer un deuxième super administrateur.

Ce script local résout le problème du premier compte : il n'existe pas encore d'administrateur pour le créer. Il n'y aura aucune route publique de création de super administrateur. Ne partagez pas l'accès au serveur ou à la base : un accès direct à PostgreSQL permet de contourner les rôles de l'API.

Les migrations ajoutent les tables et la colonne propriétaire sans supprimer les tickets. La migration complémentaire ajoute AGENT, les invitations et les états de compte. Elle conserve ACTIVE pour les comptes ayant déjà un mot de passe. La migration précédente n'est pas modifiée, au cas où elle aurait déjà été appliquée. Aucune migration n'a été appliquée automatiquement à votre base de travail.

### Vérifier et enregistrer

```powershell
npm.cmd test
git status
git add .
git commit -m "feat: prepare les comptes et le super administrateur"
git push origin develop
```

Vérifiez que vous êtes sur `develop`. `.env` et `work/` sont exclus de Git. Ne transmettez jamais les mots de passe, codes de reset ou tokens dans une capture d'écran, un commit ou un log.

## Lots restants

2. Connexion JWT, refresh avec rotation, déconnexion, middleware de rôles et protection des tickets ; tests des refus d'accès.
3. Création de comptes par SUPER_ADMIN, email d'invitation via fournisseur, acceptation et choix du mot de passe ; tests des invitations.
4. Désactivation/réactivation, mot de passe oublié par email, reset à usage unique et tests de révocation.
5. Guide complet de démonstration et vérifications de bout en bout sur PostgreSQL.

Pause après chaque lot pour permettre un commit manuel sur develop. Les consignes du professeur sont la référence ; les permissions métier non détaillées sont des choix proposés et explicités dans CONSIGNES.md.

Avant exposition publique : HTTPS, limitation des tentatives partagée si plusieurs instances, contrôle de la concurrence des calculs de mots de passe, supervision et sauvegardes. Pour un futur navigateur, prévoir une stratégie de cookies HttpOnly/Secure/SameSite et de protection CSRF plutôt que conserver les tokens durablement dans localStorage.
