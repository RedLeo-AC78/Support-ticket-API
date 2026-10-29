# Lot 4 — Comptes désactivés et mot de passe oublié

## Démarrer

Aucune nouvelle migration ni variable d'environnement. La configuration Brevo existante est réutilisée. Arrêter le serveur avec Ctrl+C, puis :

```powershell
npm.cmd run build
npm.cmd start
```

## Demander un nouveau mot de passe

Dans un deuxième terminal, sans connexion préalable :

```powershell
$emailReset = Read-Host 'Email du compte dont tu veux changer le mot de passe'
$body = @{ email = $emailReset } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/forgot-password -ContentType 'application/json' -Body $body
Remove-Variable body
```

La réponse est toujours « Si ce compte est actif, un email de réinitialisation sera envoyé. » pour une adresse syntaxiquement valide, y compris si le compte n'existe pas, est invité ou désactivé. Cela ne confirme pas la livraison. Seuls les comptes ACTIVE ayant déjà un mot de passe reçoivent un code.

Avec Brevo, vérifier la boîte mail et les spams. En mode local, ouvrir le dernier email dans `work/mail-outbox`. Copier le code sans le partager, puis :

```powershell
$code = Read-Host 'Code recu par email'
$secret = Read-Host 'Nouveau mot de passe (15 a 128 caracteres)' -AsSecureString
$confirmation = Read-Host 'Confirme le nouveau mot de passe' -AsSecureString
$body = @{
    token = $code
    newPassword = [System.Net.NetworkCredential]::new('', $secret).Password
    confirmPassword = [System.Net.NetworkCredential]::new('', $confirmation).Password
} | ConvertTo-Json
try {
    Invoke-RestMethod -Method Post -Uri http://localhost:3000/auth/reset-password -ContentType 'application/json' -Body $body
} finally {
    Remove-Variable code, secret, confirmation, body
}
```

Une réussite affiche « Mot de passe modifié. Reconnectez-vous. » Toutes les sessions du compte sont révoquées, sur tous les appareils. L'ancien mot de passe ne fonctionne plus. Se reconnecter selon [LOT2.md](LOT2.md) avec le nouveau mot de passe. Un deuxième email avertit du changement, sans contenir le mot de passe.

Ne pas refaire un reset réussi simplement parce que la notification n'arrive pas : l'échec de cette notification n'annule pas le changement déjà enregistré.

## Désactiver puis réactiver un compte

Se connecter avec un SUPER_ADMIN selon LOT2.md afin de définir `$headers`. Choisir un compte de test distinct de son propre compte. Identifier les comptes avec :

```powershell
Invoke-RestMethod http://localhost:3000/users -Headers $headers
$idCompte = Read-Host 'ID du compte de test a desactiver'
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/users/$idCompte/status" -Headers $headers -ContentType 'application/json' -Body '{"status":"DISABLED"}'
```

Le compte reste en base avec ses tickets. La connexion, le refresh et l'utilisation de ses access tokens sont désormais refusés. Les codes d'invitation et de reset sont supprimés. ADMIN, AGENT et USER ne disposent pas de cette permission.

Pour réactiver :

```powershell
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/users/$idCompte/status" -Headers $headers -ContentType 'application/json' -Body '{"status":"ACTIVE"}'
```

Si le compte avait déjà choisi un mot de passe, il redevient ACTIVE et doit se reconnecter. Ses anciennes sessions ne sont jamais restaurées. S'il n'avait pas encore accepté son invitation, il revient à INVITED et un renvoi d'invitation est nécessaire :

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/users/$idCompte/invitation" -Headers $headers
```

Ne pas changer directement les états dans pgAdmin : cela contournerait la révocation et les contrôles de l'API. Le dernier SUPER_ADMIN actif ne peut pas être désactivé (409). Une réactivation d'un compte qui n'est pas DISABLED est également refusée (409).

## Pourquoi ces choix ?

- L'email de récupération est préparé après la réponse HTTP pour ne pas révéler l'existence d'un compte par la durée de l'envoi fournisseur.
- Limites : 3 demandes par adresse et par heure, 20 par IP et par quart d'heure. Un dépassement renvoie 429. Ces limites sont en mémoire et repartent à zéro après redémarrage ; elles conviennent à une seule instance de démonstration.
- Le code de reset est aléatoire (256 bits), valable 20 minutes. Seule son empreinte SHA-256 est en base. Un code d'invitation ou un refresh token ne peut pas être utilisé comme code de reset.
- Chaque nouvelle demande éligible invalide les codes de reset précédents. Si le fournisseur refuse l'envoi ou dépasse le délai, le nouveau code est supprimé. Il faut refaire une demande après résolution du problème, en respectant les limites.
- La modification du mot de passe, la suppression des codes et la révocation des sessions ont lieu dans une seule transaction avec verrou du compte. Deux resets simultanés avec le même code : un seul réussit.
- Les changements d'état prennent un verrou global transactionnel puis verrouillent les comptes dans un ordre stable. Cela protège le dernier SUPER_ADMIN même avec deux requêtes simultanées.
- Un compte désactivé ne peut pas contourner sa désactivation avec un reset. Un compte invité doit accepter son invitation, pas utiliser le reset pour s'activer.

Les requêtes déjà autorisées et en cours peuvent terminer ; la révocation protège les requêtes suivantes. Les codes et mots de passe ne sont jamais journalisés. La notification de changement est informative : son échec est journalisé sans secret mais n'annule pas le reset.

## Limites de livraison

La file de traitement email est en mémoire, bornée à 20 tâches. Elle n'est pas persistante : un arrêt brutal peut perdre une demande qui avait reçu HTTP 202. L'arrêt normal attend les tâches dans la limite du délai d'arrêt du serveur (10 secondes). Une file durable, des tentatives de livraison planifiées et une supervision seraient nécessaires pour un service de production.

Un fournisseur peut accepter un email sans le livrer. Vérifier les journaux Brevo et l'IP autorisée si nécessaire. Les nouvelles demandes successives peuvent produire des emails arrivant dans le désordre : utiliser le code le plus récent. Les notifications et demandes d'envoi sont testées sans envoi réel automatique.

## Routes et vérification

| Route | Autorisation | Corps |
|---|---|---|
| PATCH /users/:id/status | SUPER_ADMIN | status : ACTIVE ou DISABLED |
| POST /auth/forgot-password | Publique, limitée | email |
| POST /auth/reset-password | Code valide, limitée | token, newPassword, confirmPassword |

```powershell
npm.cmd test
npm.cmd run test:db
```

Tests PostgreSQL en schémas temporaires : désactivation, réactivation, sessions révoquées, comptes invités, expiration, rejeu, reset concurrent, code remplacé, dernier Super Admin, limites de demandes, pannes d'envoi et notifications. Aucune table réelle de l'application n'est modifiée. Les deux messages d'échec email affichés pendant les tests sont attendus : ils correspondent aux pannes simulées.

## Commit

```powershell
git add .
git commit -m "feat: ajoute gestion des comptes et reset du mot de passe"
git push origin develop
```

Il reste ensuite le lot 5 : revue finale des consignes et guide de présentation.
