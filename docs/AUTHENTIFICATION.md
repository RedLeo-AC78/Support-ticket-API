# Authentification — vue d'ensemble

Les guides [LOT1.md](LOT1.md) à [LOT5.md](LOT5.md) expliquent l'installation, chaque fonctionnalité, les tests et la présentation. Ce document résume le fonctionnement actuel.

## Identifier puis autoriser

L'authentification répond à « qui fait la requête ? ». La connexion vérifie l'email et l'empreinte scrypt du mot de passe, puis émet un JWT et un refresh token. L'autorisation répond à « que peut faire ce compte ? ». Les middlewares vérifient le rôle actuel et les requêtes Prisma filtrent les tickets selon leur propriétaire.

Le JWT contient les identifiants du compte et de sa session, un identifiant de token et les dates, l'émetteur et le destinataire. Il est signé, pas chiffré : aucun secret ne doit être placé dedans. jose vérifie la signature et les claims. Le serveur vérifie aussi la session et l'état du compte en base pour permettre une révocation immédiate des prochains appels.

## Mot de passe et tokens

Un mot de passe humain doit être protégé avec un calcul coûteux : scrypt avec un sel aléatoire par compte. Il ne se déchiffre pas ; lors d'une connexion, on recalcule puis compare son empreinte. Les espaces sont préservés, avec une longueur de 15 à 128 caractères.

Les refresh tokens et codes d'invitation/reset contiennent 256 bits aléatoires. Leurs empreintes SHA-256 suffisent à vérifier ces secrets difficiles à deviner, contrairement aux mots de passe humains. Le JWT courant est également identifié par son empreinte en base.

Le refresh dure jusqu'à l'expiration absolue de la session de 7 jours. Chaque renouvellement remplace les deux tokens ; rejouer l'ancien refresh révoque la session. Le client doit sérialiser les renouvellements. La déconnexion révoque une session ; reset et désactivation révoquent toutes les sessions du compte.

## Inviter, récupérer et désactiver

Le Super Admin invite un compte sans connaître son futur mot de passe. L'invitation de 24 heures active le compte uniquement lors de son acceptation. Le rôle est déterminé par le Super Admin et ne peut pas être modifié par le destinataire.

La récupération envoie un code de 20 minutes uniquement aux comptes actifs, tout en donnant une réponse HTTP générique. Le reset remplace le mot de passe et révoque les sessions dans la même transaction. Une notification informe du changement sans révéler le mot de passe.

La désactivation invalide sessions, invitations et resets. La réactivation exige une nouvelle connexion ; un compte jamais activé revient à INVITED. Un verrou transactionnel protège le dernier Super Admin actif contre les désactivations concurrentes.

## Points à expliquer à l'oral

- Un token prouve une connexion ; il ne remplace pas les contrôles de rôle et de propriétaire.
- La base est consultée même avec un JWT : c'est un choix pour révoquer immédiatement les accès et lire les permissions actuelles.
- Les transactions empêchent une consommation multiple des codes sous concurrence.
- Le succès de l'appel Brevo ne garantit pas la réception dans la boîte mail.
- HTTPS protège le transport ; le hachage protège le stockage. L'un ne remplace pas l'autre.
- Les limites en mémoire et la file email non persistante sont adaptées à cette démonstration, pas à plusieurs serveurs sans adaptations.

Références : [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [documentation jose](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md).
