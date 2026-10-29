# Lot 3 — Comptes sur invitation et emails

## Ce qui fonctionne

- SUPER_ADMIN crée un compte avec email et rôle, sans choisir le mot de passe du destinataire.
- Un email contient un code aléatoire valable 24 heures.
- Le destinataire présente ce code et choisit son mot de passe ; son compte passe de INVITED à ACTIVE.
- Une nouvelle invitation remplace toutes les invitations précédentes du compte.
- Le serveur utilise Brevo via `fetch` natif de Node.js, sans nouvelle dépendance.

Aucune migration supplémentaire pour ce lot : les modèles étaient préparés au lot 1. Après avoir arrêté l'ancien serveur avec Ctrl+C :

```powershell
npm.cmd run build
npm.cmd start
```

## 1. Tester d'abord sans service externe

Sans configuration supplémentaire, le mode local enregistre chaque email dans `work/mail-outbox/`, sous forme de fichier JSON. Aucun vrai email n'est envoyé. Ce dossier est exclu de Git et n'est pas exposé par Express. Il contient des codes confidentiels : ne pas le partager ni publier son contenu. Sur Windows, les permissions du dossier du projet s'appliquent.

Reconnectez-vous comme SUPER_ADMIN en suivant [le lot 2](LOT2.md). Dans le même terminal, `$headers` doit contenir votre access token valide. Inviter un utilisateur :

```powershell
$emailInvite = Read-Host "Email de la personne a inviter"
$body = @{ email = $emailInvite; role = 'USER' } | ConvertTo-Json
$invitation = Invoke-RestMethod -Method Post -Uri http://localhost:3000/users -Headers $headers -ContentType 'application/json' -Body $body
$invitation
```

La réponse contient `user` et `invitation.status`. Le statut du compte est INVITED ; celui de l'envoi est `local`. Le compte n'a pas encore de mot de passe. Les rôles possibles sont USER, AGENT, ADMIN et SUPER_ADMIN ; attribuer le minimum nécessaire.

Dans VS Code, ouvrir le dossier `work/mail-outbox`, puis le fichier le plus récent. Le champ `text` contient le code d'invitation. En mode local, vous jouez le rôle du destinataire : copiez uniquement ce code, pas tout le contenu du fichier.

## 2. Accepter l'invitation

Dans un terminal, exécuter :

```powershell
$code = Read-Host "Code recu dans l'email"
$secret = Read-Host 'Choisis un mot de passe de 15 a 128 caracteres' -AsSecureString
$confirmation = Read-Host 'Confirme ce mot de passe' -AsSecureString
$password = [System.Net.NetworkCredential]::new('', $secret).Password
$confirmPassword = [System.Net.NetworkCredential]::new('', $confirmation).Password
$body = @{ token = $code; password = $password; confirmPassword = $confirmPassword } | ConvertTo-Json
try {
    Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/accept-invitation -ContentType 'application/json' -Body $body
} finally {
    Remove-Variable code, secret, confirmation, password, confirmPassword, body
}
```

Aucun access token n'est demandé ici : le code d'invitation constitue la preuve d'accès à la boîte email. Ce n'est pas une inscription publique : seul un compte préalablement invité peut être activé. La réponse ne contient pas de token de connexion ; connectez-vous ensuite avec votre email et votre nouveau mot de passe selon [LOT2.md](LOT2.md).

L'acceptation ne permet pas de modifier le rôle ou l'email. Présenter le code une seconde fois renvoie 400. Le compte activé ne peut plus recevoir une invitation ; le reset de mot de passe sera traité au lot 4.

## 3. Envoyer réellement avec Brevo

1. Créer un compte sur [Brevo](https://www.brevo.com/).
2. Configurer et vérifier l'expéditeur et le domaine d'envoi demandés par Brevo. Si vous ne possédez pas de domaine, vérifier les possibilités offertes à votre compte ; le domaine gratuit d'une adresse Gmail ne vous appartient pas et vous ne pouvez pas modifier son DNS.
3. Créer une **clé API**, et non une clé SMTP, dans les réglages API du compte.
4. Dans `.env`, ajouter ces lignes en remplaçant les exemples :

```env
MAIL_MODE=brevo
BREVO_API_KEY=VOTRE_CLE_API
MAIL_FROM_EMAIL=adresse-expediteur-verifiee@votre-domaine.fr
MAIL_FROM_NAME="Support Ticket"
```

Conserver DATABASE_URL, PORT et JWT_SECRET déjà présents. Ne pas copier les secrets dans `.env.example`, GitHub ou le chat. Redémarrer le serveur avec Ctrl+C puis `npm.cmd start` : `.env` est lu au démarrage.

Inviter ensuite une adresse que vous contrôlez pour vérifier la réception. `invitation.status: accepted` signifie que Brevo a accepté la requête ; vérifier aussi la boîte mail, les spams et les journaux transactionnels Brevo. Cela ne prouve pas la livraison finale. Pour un autre ordinateur, l'API doit être accessible sur une adresse HTTPS : `localhost` désigne toujours la machine de la personne qui exécute la commande.

Documentation officielle : [envoi transactionnel Brevo](https://developers.brevo.com/docs/send-a-transactional-email), [référence de l'API](https://developers.brevo.com/reference/send-transac-email).

## Renvoi et panne d'email

Si le fournisseur refuse l'envoi ou ne répond pas en 10 secondes, le compte reste INVITED et la réponse annonce `invitation.status: failed`. Le code n'est jamais renvoyé par l'API. Le statut HTTP 201 indique la création du compte, pas la livraison de l'email.

Corriger la configuration puis, en tant que SUPER_ADMIN, renvoyer :

```powershell
$idInvite = Read-Host 'ID du compte invite'
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users/$idInvite/invitation" -Headers $headers
```

Retrouver les identifiants avec `GET /users`. Ne pas recréer le compte : un email déjà utilisé renvoie 409. Le renvoi ne fonctionne que pour INVITED, pas ACTIVE ou DISABLED. Il invalide immédiatement les anciens codes, même si le nouvel envoi échoue ; il faut alors effectuer un nouveau renvoi après correction.

Il n'y a pas de file d'attente durable ni de relance automatique dans ce projet : un arrêt entre la création et l'envoi nécessite un renvoi manuel. Si plusieurs invitations sont renvoyées rapidement, seul le code le plus récemment enregistré est valide, même si les emails arrivent dans le désordre. En production, une file d'envoi persistante et le suivi des événements de livraison seraient des améliorations utiles.

## Pourquoi ces protections ?

- Le compte n'a pas de mot de passe avant acceptation : l'administrateur ne connaît pas le mot de passe choisi.
- Le code contient 32 octets aléatoires et seule son empreinte est en base. Ce code est différent des tokens de connexion et des futurs codes de reset.
- Une transaction et un verrou de ligne empêchent deux acceptations simultanées : une seule réussit.
- Un compte DISABLED est refusé, même si son invitation n'a pas expiré.
- Les requêtes sont limitées et les hachages d'acceptation simultanés sont bornés à deux par instance ; la connexion a sa propre limite de deux.
- Le mode local est interdit lorsque NODE_ENV=production. Il sert uniquement à tester le parcours avant la configuration du fournisseur.

Le contenu email utilise du texte brut, pas du HTML fourni par le client. Aucun mot de passe n'est envoyé par email, conservé en clair ou inclus dans la réponse HTTP. La clé Brevo reste côté serveur. Le fournisseur reçoit nécessairement l'adresse et le code pour livrer l'invitation.

## Routes et tests

| Route | Accès | Résultat |
|---|---|---|
| POST /users | SUPER_ADMIN | Crée le compte INVITED et tente l'envoi |
| POST /users/:id/invitation | SUPER_ADMIN | Remplace le code et tente un renvoi |
| POST /auth/accept-invitation | Code valide | Définit le mot de passe et active le compte |

```powershell
npm.cmd test
npm.cmd run test:db
```

Les tests n'envoient aucun email réel. Le transport Brevo est testé avec des réponses simulées. Le parcours est testé sur PostgreSQL dans un schéma temporaire : rôles refusés, doublon d'email, invitation expirée, compte désactivé, concurrence, rejeu, tentative de changer le rôle, panne fournisseur et renvoi. La réception réelle devra être vérifiée après configuration de votre compte Brevo.

## Commit du lot 3

```powershell
git status
git add .
git commit -m "feat: ajoute les invitations et les emails Brevo"
git push origin develop
```

Le prochain lot traitera la désactivation/réactivation par API et le mot de passe oublié.
