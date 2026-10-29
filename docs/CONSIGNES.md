# Conformité aux consignes du professeur

La revue finale couvre les fonctionnalités demandées et les tests du projet. Les parcours invitation et reset par email réel, connexion, désactivation et réactivation ont également été testés manuellement avec l'utilisateur. Les tests automatisés simulent les emails : ils n'envoient aucun message réel.

| Consigne | Réalisation | Vérification |
|---|---|---|
| Création par Super Admin sans inscription publique | POST /users et bootstrap local du premier compte | Refus ADMIN/AGENT/USER et anonyme ; /auth/register absent |
| Invitations par email | Brevo ou mode local, renvoi disponible | Envoi simulé, panne et renvoi ; réception réelle confirmée |
| Acceptation et choix du mot de passe | POST /auth/accept-invitation | Expiration, rejeu, concurrence, rôle non modifiable |
| Connexion email/mot de passe | POST /auth/login, scrypt | Compte actif accepté, invité/désactivé refusé |
| JWT access token et refresh token | JWT signé HS256 par jose ; refresh opaque aléatoire | Signature, expiration, émetteur, destinataire et claims |
| Refresh et rotation | POST /auth/refresh, transaction | Ancien access token invalidé ; rejeu et concurrence |
| Logout et révocation | POST /auth/logout | Access et refresh refusés après logout |
| Quatre rôles | SUPER_ADMIN, ADMIN, AGENT, USER | Schéma et tests de permissions |
| Endpoints restreints | Middlewares et filtres de propriétaire | Ticket d'un autre utilisateur inaccessible |
| Demande de reset par email | POST /auth/forgot-password | Réponse générique, limites, compte éligible, panne fournisseur |
| Reset sécurisé à usage unique | POST /auth/reset-password | Expiration, rejeu, concurrence, sessions révoquées |
| Désactivation/réactivation | PATCH /users/:id/status | Rôles, anciennes sessions, dernier Super Admin, invité réactivé |
| Resend ou alternative | Brevo avec fetch natif | Transport simulé et réception réelle confirmée |

## Matrice des permissions

Les consignes nomment les rôles sans définir tous leurs droits. La matrice ci-dessous est le choix métier appliqué dans ce projet, ajustable avec le professeur.

| Action | SUPER_ADMIN | ADMIN | AGENT | USER |
|---|---|---|---|---|
| Inviter / renvoyer une invitation | Oui | Non | Non | Non |
| Désactiver / réactiver un compte | Oui | Non | Non | Non |
| Lister les comptes sans secrets | Oui | Oui | Non | Non |
| Créer un ticket | Oui | Oui | Oui | Oui |
| Lire les tickets ayant un propriétaire | Tous | Tous | Tous | Les siens |
| Lire les tickets historiques sans propriétaire | Oui | Oui | Non | Non |
| Modifier le statut d'un ticket visible | Oui | Oui | Oui | Non |

L'accès aux tickets est filtré en base ; cacher un bouton ne suffirait pas. Le rôle est relu depuis la base, pas accepté depuis le JSON envoyé par le client. Le premier SUPER_ADMIN est créé localement ; les suivants peuvent être invités par un SUPER_ADMIN authentifié. Le dernier SUPER_ADMIN actif ne peut pas être désactivé.

## Durées et états

Access token : 15 minutes maximum ; session/refresh : 7 jours sans prolongation glissante ; invitation : 24 heures ; reset : 20 minutes. Les codes d'invitation et de reset sont séparés et consommés dans une transaction. Un renvoi remplace le code précédent.

INVITED signifie qu'un mot de passe reste à choisir ; ACTIVE permet la connexion ; DISABLED interdit l'accès. Réactiver un compte ne réactive jamais ses anciennes sessions. Sans mot de passe, le compte revient à INVITED et nécessite une nouvelle invitation.

## Portée de la validation

Les tests automatisés sont dans `tests/`, le détail des commandes dans [LOT5.md](LOT5.md). Ils vérifient les scénarios précisés ci-dessus, sans constituer un audit de sécurité complet. Les limites de déploiement sont documentées dans le README et les guides ; le projet n'est pas présenté comme un service de production prêt à être exposé tel quel.
