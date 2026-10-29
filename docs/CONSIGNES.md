# Conformité aux consignes du professeur

État après le lot 3 : connexion, JWT, rotation, permissions, invitations et acceptation implémentés et testés sur PostgreSQL. Le transport Brevo est implémenté et testé avec un fournisseur simulé ; la réception réelle nécessite les identifiants et l'expéditeur vérifié de votre compte. Le lot 4 reste à réaliser. Voir [LOT2.md](LOT2.md) et [LOT3.md](LOT3.md).

| Consigne | Décision et état |
|---|---|
| Création par Super Admin, sans inscription publique | POST /users, réservé à SUPER_ADMIN ; terminé |
| Invitation par email | Mode local et transport Brevo ; renvoi disponible ; terminé, compte fournisseur à configurer |
| Acceptation et choix du mot de passe | POST /auth/accept-invitation ; activation atomique ; terminé |
| Connexion email/mot de passe | Hachage prêt ; route à faire au lot 2 |
| Access tokens JWT et refresh tokens | JWT signé pour l'accès, secret opaque pour le refresh ; lot 2 |
| Renouvellement et rotation | Modèles prêts ; transaction et détection de rejeu au lot 2 |
| Déconnexion et révocation | Session révocable ; route au lot 2 |
| SUPER_ADMIN, ADMIN, AGENT, USER | Quatre rôles ajoutés au schéma |
| Restrictions par permissions | Politique centralisée prête ; application HTTP au lot 2 |
| Demande de reset par email | Réponse générique, fournisseur email ; lot 4 |
| Reset sécurisé à usage unique | Modèle prêt ; consommation atomique au lot 4 |
| Désactivation et réactivation | États ajoutés ; routes et révocation au lot 4 |
| Resend ou alternative | Brevo intégré via fetch natif ; envoi réel à configurer dans .env |

## Matrice proposée

Les consignes donnent les rôles sans préciser tous leurs droits. Cette matrice est donc un choix métier explicite, ajustable avec le professeur.

| Action | SUPER_ADMIN | ADMIN | AGENT | USER |
|---|---|---|---|---|
| Inviter un compte | Oui | Non | Non | Non |
| Désactiver/réactiver un compte | Oui | Non | Non | Non |
| Lister les comptes sans secrets | Oui | Oui | Non | Non |
| Créer un ticket | Oui | Oui | Oui | Oui |
| Consulter tous les tickets | Oui | Oui | Oui | Non |
| Consulter ses propres tickets | Oui | Oui | Oui | Oui |
| Changer le statut d'un ticket | Oui | Oui | Oui | Non |

Le rôle USER n'autorisera que la lecture de ses tickets via un filtre de propriétaire en base, pas uniquement via un contrôle du rôle. Les tickets historiques sans propriétaire resteront réservés aux ADMIN et SUPER_ADMIN. AGENT pourra traiter les tickets ayant un propriétaire ; cette exception devra être contrôlée dans les requêtes du lot 2.

Le premier SUPER_ADMIN est créé localement par `npm run admin:create`. Les suivants, si nécessaires, pourront être invités par un SUPER_ADMIN authentifié. Aucun rôle ne sera choisi par le destinataire de l'invitation : il provient du compte préparé par SUPER_ADMIN. L'API empêchera la désactivation du dernier SUPER_ADMIN actif.

## Parcours cible

1. SUPER_ADMIN crée un compte avec email et rôle, sans définir le mot de passe du destinataire.
2. L'application enregistre INVITED et envoie un code aléatoire d'invitation. Seule son empreinte est conservée en base.
3. Le destinataire fournit le code et choisit son mot de passe. Une transaction consomme l'invitation et active le compte.
4. La connexion délivre un JWT et un refresh token. Chaque refresh remplace les deux tokens.
5. La déconnexion révoque la session. Un reset ou une désactivation révoque toutes les sessions du compte.

Les invitations seront limitées à 24 heures et les resets à 20 minutes, à usage unique. Les codes d'invitation et de reset resteront séparés afin d'empêcher leur utilisation dans le mauvais parcours. Une nouvelle invitation invalidera la précédente.

## Scénarios de vérification à réaliser

- ADMIN, AGENT et USER ne peuvent pas inviter, même en forgeant le JSON.
- Une invitation expirée, consommée ou pour un compte désactivé est refusée.
- Un compte invité ne peut pas se connecter avant acceptation.
- JWT expiré, signature invalide, mauvais émetteur/destinataire ou algorithme inattendu : refus.
- Un refresh token rejoué révoque sa session ; deux refresh concurrents ne produisent pas deux sessions utilisables.
- USER ne peut pas consulter le ticket d'un autre USER en devinant son ID.
- Un compte désactivé ne peut ni se connecter ni renouveler ni utiliser un access token existant.
- Une réactivation ne restaure pas les anciennes sessions et ne contourne pas une invitation non acceptée.
- Le reset ne révèle pas si un email existe et ne fonctionne qu'une fois, même avec deux requêtes simultanées.
- Les emails et réponses API ne contiennent jamais de mot de passe ni de passwordHash.
