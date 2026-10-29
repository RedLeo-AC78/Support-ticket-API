# Lot 2 — Connexion JWT et autorisations

## Lancer après la mise à jour

Arrêter l'ancien serveur avec Ctrl+C, puis dans le dossier du projet :

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run auth:setup
```

`auth:setup` ajoute une clé aléatoire de 32 octets dans `.env`, sans l'afficher. Il ne remplace pas une clé existante. Ne pas copier cette clé dans le code ou dans Git. Une modification de cette clé invalide les JWT existants.

Si le premier super administrateur n'existe pas encore :

```powershell
npm.cmd run admin:create
```

Puis :

```powershell
npm.cmd run build
npm.cmd start
```

## Démonstration PowerShell

Dans un deuxième terminal, saisir les identifiants du super administrateur créé localement. La saisie masquée évite d'enregistrer le mot de passe dans l'historique des commandes.

```powershell
$email = Read-Host 'Email'
$secret = Read-Host 'Mot de passe' -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $secret)
$body = @{ email = $email; password = $credential.Password } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/login -ContentType 'application/json' -Body $body
Remove-Variable body, credential, secret
$headers = @{ Authorization = "Bearer $($session.accessToken)" }

Invoke-RestMethod http://localhost:3000/auth/me -Headers $headers

$ticket = Invoke-RestMethod -Method Post -Uri http://localhost:3000/tickets -Headers $headers -ContentType 'application/json' -Body '{"title":"Test authentifie","description":"Mon premier ticket avec un JWT"}'
Invoke-RestMethod http://localhost:3000/tickets -Headers $headers
Invoke-RestMethod "http://localhost:3000/tickets/$($ticket.id)" -Headers $headers
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/tickets/$($ticket.id)/status" -Headers $headers -ContentType 'application/json' -Body '{"status":"IN_PROGRESS"}'
```

Renouveler les tokens et remplacer ceux conservés par le client :

```powershell
$body = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/refresh -ContentType 'application/json' -Body $body
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
Remove-Variable body
```

Se déconnecter :

```powershell
$body = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/logout -ContentType 'application/json' -Body $body
Remove-Variable body, session, headers
```

Ne pas afficher `$session` dans une capture : il contient les tokens. PowerShell doit nécessairement manipuler le mot de passe en mémoire pour l'envoyer ; le terminal masqué ne remplace pas HTTPS hors localhost.

## Routes disponibles

| Route | Entrée / accès |
|---|---|
| POST /auth/login | email et password ; compte ACTIVE |
| POST /auth/refresh | refreshToken ; rotation obligatoire |
| POST /auth/logout | refreshToken ; révocation de la session |
| GET /auth/me | Authorization: Bearer accessToken |
| GET /users | ADMIN ou SUPER_ADMIN ; aucune empreinte de mot de passe |
| POST /tickets | Compte connecté ; propriétaire imposé par le serveur |
| GET /tickets, GET /tickets/:id | USER : ses tickets ; AGENT : tickets ayant un propriétaire ; ADMIN/SUPER_ADMIN : tous |
| PATCH /tickets/:id/status | AGENT, ADMIN ou SUPER_ADMIN ; même restriction de visibilité |

`401` signifie authentification absente, expirée ou refusée. `403` signifie permission insuffisante. Un ticket appartenant à quelqu'un d'autre renvoie `404` pour ne pas révéler son existence. `429` limite les tentatives ou les calculs simultanés. Il n'existe pas de route d'inscription publique. Les invitations et la création de comptes par API seront ajoutées au lot 3.

## Pourquoi ce fonctionnement ?

Le JWT contient l'identifiant du compte (`sub`), celui de la session (`sid`), un identifiant aléatoire (`jti`), l'émetteur, le destinataire et les dates. La bibliothèque `jose` signe en HS256 et vérifie signature, algorithme, type, claims obligatoires et expiration. La durée d'accès est de 15 minutes maximum. Le JWT est signé, pas chiffré : son contenu est lisible.

Le rôle provient de la base à chaque requête, pas d'une affirmation du client. La session, son empreinte d'access token et l'état ACTIVE sont également contrôlés : cela permet une révocation immédiate des prochains appels. Une requête déjà autorisée et en cours peut toutefois terminer son exécution.

Un refresh token est un secret aléatoire de 256 bits ; seule son empreinte SHA-256 est conservée. Il ne s'agit pas d'un JWT. La session expire définitivement après 7 jours : les renouvellements ne repoussent pas cette date. Le renouvellement invalide aussi l'ancien access token. Conserver uniquement le nouveau couple reçu.

La transaction verrouille la ligne du compte avant la rotation. Le token précédent est marqué utilisé ; s'il est rejoué, toute sa session est révoquée. Deux renouvellements simultanés sont donc traités comme un rejeu : le client doit sérialiser les refresh. Après une réponse réseau perdue, une reconnexion peut être nécessaire.

La déconnexion révoque une seule session ; les autres appareils restent connectés. Les routes futures de reset et de désactivation devront révoquer toutes les sessions sous le même verrou. Ne pas changer directement DISABLED en ACTIVE dans pgAdmin pour gérer les comptes : la route du lot 4 réalisera également les invalidations nécessaires.

Limites assumées : limites de débit en mémoire pour une seule instance, deux calculs scrypt simultanés au maximum, listes non paginées, pas encore de nettoyage périodique des sessions expirées. Ne pas supprimer les anciens refresh tokens d'une session encore valide : ils servent à détecter le rejeu. Configurer HTTPS et une stratégie de limitation partagée avant un déploiement public. Pour un navigateur, prévoir une gestion HttpOnly/Secure/SameSite et CSRF dédiée avant d'ajouter des cookies.

Référence de vérification : [documentation officielle jose](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md).

## Vérifications

```powershell
npm.cmd test
npm.cmd run test:db
```

La première commande vérifie HTTP sans base, JWT, permissions et hachage. La seconde crée un schéma PostgreSQL temporaire `test_auth_...`, applique les migrations, teste les parcours réels et supprime ce schéma. Elle utilise la connexion `.env` mais ne modifie pas les tables de votre application. Le compte PostgreSQL doit avoir le droit de créer des schémas.

Vérifié : rotation, rejeu, concurrence, logout, compte désactivé/invité refusé, session expirée, rôle, visibilité des tickets et refus des JWT invalides. Les routes d'invitation, de reset et de gestion d'état appartiennent aux prochains lots.
