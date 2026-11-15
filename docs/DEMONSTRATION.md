# Démonstration guidée pour le professeur

## Préparation

Prévoir 5 à 10 minutes, un compte USER actif et un compte SUPER_ADMIN actif. Les mots de passe sont demandés avec saisie masquée ; les tokens ne sont jamais affichés. Utiliser les comptes déjà créés : aucune invitation ni aucun email ne sera envoyé par le script.

Dans un terminal du dossier du projet :

```powershell
npm.cmd run build
npm.cmd start
```

Dans un deuxième terminal, ouvert dans le même dossier :

```powershell
& .\scripts\demo.ps1
```

Si Windows indique que l'exécution des scripts est désactivée, cette commande autorise uniquement ce processus de démonstration, sans changer la politique globale :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

Le script demande d'appuyer sur Entrée avant chaque étape. Lire la phrase « À expliquer », la reformuler au professeur, puis exécuter l'étape. Un nouveau ticket est créé à chaque exécution ; il est conservé pour pouvoir être relu ensuite. Les tickets existants ne sont pas modifiés.

## Introduction à dire

« Je vais montrer une demande de support de sa création à sa prise en charge. Je vais aussi montrer que le serveur refuse les actions non autorisées, même si on les demande directement à l'API. »

## Déroulement

| Étape | Ce que le professeur voit | Ce que cela démontre |
|---|---|---|
| Requête sans token | Refus HTTP 401 | Authentification obligatoire |
| Connexion USER | Identité, rôle et état, sans secrets | Connexion réussie |
| Création | Ticket OPEN avec propriétaire | Validation et enregistrement |
| Consultation | Ticket retrouvé par ID | Lecture depuis PostgreSQL |
| Modification par USER | Refus HTTP 403 | Autorisation distincte de la connexion |
| Modification par SUPER_ADMIN | Ticket IN_PROGRESS | Traitement autorisé |
| Relecture et refresh | Ancien access token refusé, nouveau accepté | Rotation et suivi du ticket |
| Logout | Token auparavant valide désormais refusé | Révocation de session |

La sélection des tickets selon leur propriétaire est expliquée pendant la démonstration ; l'isolation entre deux USER est couverte par les tests PostgreSQL. Ce scénario n'affiche pas de faux résultat de contrôle d'accès : avant le test 403, il vérifie que la connexion fonctionne réellement.

## Montrer ensuite la structure du code

Ouvrir ces fichiers dans cet ordre :

1. `src/app.ts` : assemblage d'Express, sans règles métier.
2. `src/routes/tickets.routes.ts` : URL et protection de la modification de statut.
3. `src/controllers/tickets.controller.ts` : requête et réponse HTTP.
4. `src/services/tickets.service.ts` : propriétaire et visibilité.
5. `src/repositories/tickets.repository.ts` : requêtes Prisma.
6. `prisma/schema.prisma` : structure du ticket et relation avec User.

Phrase à retenir : « La route dirige la requête, le middleware contrôle l'accès, le contrôleur adapte HTTP, le service applique les règles et le repository accède à la base. »

Le script renouvelle les tokens entre les étapes pour éviter une expiration de 15 minutes pendant une explication. Il ne montre pas le rejeu d'un refresh token, qui révoquerait volontairement la session ; ce cas est testé automatiquement.

Les parcours invitation, reset et désactivation peuvent être montrés ensuite avec les guides LOT3 et LOT4. Ils sont séparés de cette démonstration pour ne pas mélanger toutes les notions à la fois.

## Vérification du script

La syntaxe PowerShell a été vérifiée. La démonstration interactive doit être exécutée avec vos comptes ; elle n'a pas été lancée automatiquement sur vos données. Les endpoints utilisés sont ceux couverts par les tests du projet.
