# PISTE-002 — Quota de connexion consommé avant validation

Mise à jour : piste reproduite personnellement le 17 novembre 2026 ; voir [VULN-002](VULN-002.md). Le texte ci-dessous conserve la préparation initiale et ne représente plus le statut courant.

## Identifiant

PISTE-002. Analyse statique et test préparé le 17 novembre 2026. **Non confirmée par exécution à ce stade.** Aucun correctif appliqué.

## Nom et description

Possibilité de bloquer temporairement une connexion légitime en consommant le quota email avec des mots de passe manifestement invalides. Dans auth.routes.ts, rateLimit(10, 15 minutes, emailKey) s'exécute avant passwordValue dans auth.service.ts. Une saisie d'un caractère peut ainsi consommer le quota d'une adresse choisie sans vérifier son mot de passe.

## Localisation

POST /auth/login ; src/routes/auth.routes.ts et src/services/auth.service.ts.

## Criticité provisoire

Faible à moyenne, à réévaluer après preuve : disponibilité temporaire d'un compte, sans accès aux données ni vol de session. La connaissance de l'adresse suffit pour cibler le quota. La durée configurée est de 15 minutes et les limites IP réduisent les répétitions. L'impact entre IP différentes est suggéré par la clé email globale mais n'est pas reproduit par le test local prévu.

## Scénario et preuve prévue

Le test crée un compte fictif dans un schéma temporaire, vérifie d'abord son mot de passe correct (200), puis envoie neuf saisies trop courtes (400). La première connexion ayant consommé une unité, une nouvelle connexion correcte pourrait être refusée (429). Onze requêtes au total restent sous la limite IP de 30, pour distinguer les deux mécanismes. Aucune clé, session ou mot de passe réel n'est affiché.

Test préparé : tests/audit-login-quota.test.mjs. Le mode vulnerable attend 429 ; le mode fixed attend 200. **Un test préparé n'est pas une preuve d'exécution.** Le test n'est pas intégré à la suite DB standard tant que la piste n'est pas traitée.

## Impact à vérifier

Empêcher temporairement une nouvelle connexion malgré la connaissance du bon mot de passe. Aucune compromission du compte, invalidation des sessions existantes ou attaque réseau distribuée n'est démontrée.

## Correction proposée, non appliquée

Conserver la limite IP avant la validation pour protéger le serveur. Valider ensuite le corps, l'email et la forme du mot de passe avant de consommer le quota email. Les tentatives correctement formées avec un mauvais mot de passe doivent rester limitées. Cette modification corrigerait uniquement la consommation par des corps manifestement invalides ; elle ne supprime pas à elle seule tous les compromis entre anti-bruteforce et blocage d'un compte.

Avant : limite IP → limite email → validation et authentification.

Après proposé : limite IP → validation du corps → limite email → authentification.

Les extraits exacts avant/après et le retest seront ajoutés si le problème est reproduit et la correction effectuée. Aucun résultat n'est inventé à cette étape.

## Retest

En attente. Après correction, vérifier que les neuf entrées trop courtes restent refusées avec 400, que la connexion correcte réussit, et que le quota anti-bruteforce continue à fonctionner pour des saisies valides.

## Référence

[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) : une politique de verrouillage doit prendre en compte le risque de déni de service contre les comptes. Cette référence explique le risque général, elle ne prouve pas la faille du projet.
