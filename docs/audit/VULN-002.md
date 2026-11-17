# VULN-002 — Blocage de connexion par consommation du quota email

## Identifiant

VULN-002. Comportement reproduit personnellement par l'élève le 17 novembre 2026 à 11:20:35 UTC (12:20:35 à Paris). Correctif exécuté par l’élève, compilation réussie et retest personnel réussi le 17 novembre 2026 à 11:28:33 UTC (12:28:33 à Paris).

## Nom de la vulnérabilité

Des mots de passe manifestement invalides consomment le quota de connexion d'une adresse et empêchent temporairement sa connexion légitime.

## Description

La limite email est exécutée avant la validation du corps. Même un mot de passe d'un caractère, qui ne peut pas être accepté par la politique de l'application, consomme une tentative. Le quota est partagé par adresse email, indépendamment du mot de passe. Le scénario local montre une connexion correcte ensuite refusée par le quota, sans atteindre la vérification du mot de passe.

## Localisation

src/routes/auth.routes.ts, POST /auth/login : ordre des middlewares. Validation dans src/services/auth.service.ts et src/utils/security.ts.

## Criticité

**Faible dans le périmètre scolaire testé** : indisponibilité temporaire d'une nouvelle connexion, sans accès à des données ni compromission du compte. La limite IP réduit les répétitions. Un blocage entre adresses IP différentes est suggéré par la clé email globale, mais n'est pas démontré par cette exécution locale. Le délai annoncé est de 900 secondes ; l'expiration effective après attente de 15 minutes n'a pas été mesurée.

## Scénario d'exploitation

Le test crée un compte fictif, vérifie qu'il peut se connecter (200), puis envoie neuf mots de passe trop courts (400). La première connexion ayant consommé une unité, les dix unités du quota sont atteintes. La prochaine connexion avec le bon mot de passe est refusée (429). Onze requêtes restent sous le quota IP de 30 : ce dernier n'explique pas le refus observé.

## Preuve d'exploitation

[Sortie personnelle avant correction](preuves/PISTE-002-avant-eleve.txt), conservée sous son nom initial pour garder la trace de la phase de piste.

```json
{"baseline":200,"invalidRequests":[400,400,400,400,400,400,400,400,400],"legitimateLoginAfter":429,"retryAfter":"900","code":"TOO_MANY_REQUESTS"}
```

Le test tests/audit-login-quota.test.mjs utilise des requêtes HTTP réelles, une base temporaire et un compte fictif. Aucun email ni appel IA. Mode vulnerable : 1 test réussi, 0 échec signifie que le comportement problématique attendu a été reproduit. L'empreinte SHA-256 de la route est dans la preuve brute. Aucun token ni mot de passe n'y est affiché.

## Impact

Refus temporaire d'une nouvelle connexion malgré un mot de passe correct. Les sessions existantes ne sont pas révoquées. Aucun accès aux données ni contrôle du compte n'est démontré.

## Correction appliquée par l’élève

L’élève a exécuté scripts/fix-vuln002.mjs, puis le formatage et la compilation. Le script ajoute la validation avant le quota email et adapte le test HTTP existant pour vérifier la limite IP. Les extraits suivants décrivent le correctif effectivement appliqué.

Avant :

```typescript
router.post("/login", byIp, rateLimit(10, 15 * 60 * 1000, emailKey), controller.login);
```

Après correction :

```typescript
const validateLoginBody: RequestHandler = (req, _res, next) => {
  const body = objectBody(req.body, ["email", "password"]);
  emailValue(body.email);
  passwordValue(body.password);
  next();
};

router.post("/login", byIp, validateLoginBody,
  rateLimit(10, 15 * 60 * 1000, emailKey), controller.login);
```

La limite IP reste avant validation, pour borner aussi les requêtes invalides. Le contrôle métier est conservé dans le service. Les mauvais mots de passe de forme valide doivent toujours consommer le quota email : il s'agit d'une correction ciblée, pas d'une suppression générale du risque de blocage lié aux politiques anti-bruteforce.

## Retest

Retest personnel enregistré le 17 novembre 2026 à 11:28:33 UTC : [preuve brute](preuves/VULN-002-apres-eleve.txt). Résultat observé : baseline=200, neuf réponses 400, legitimateLoginAfter=200, retryAfter=null, code=SUCCESS ; 1 test réussi et 0 échec. L’empreinte SHA-256 de la route corrigée est 5851349ea074b2abf5d201d8d614850cc627e78839d46c12ee8a46993883df21. Les preuves avant et après sont conservées sans réécriture. Le contrôle complémentaire a été exécuté personnellement le 17 novembre 2026 à 12:52:01 UTC (13:52:01 à Paris) : [preuve brute](preuves/VULN-002-controle-quota-eleve.txt). Les neuf saisies trop courtes sont refusées avec 400 sans empêcher la connexion correcte suivante (200). Huit mauvais mots de passe de longueur valide donnent ensuite 401, puis la connexion après épuisement du quota donne 429, code TOO_MANY_REQUESTS et Retry-After=897. Vingt requêtes seulement ont été utilisées, sous le quota IP de trente : le refus correspond au quota email. Résultat : 1 test réussi, 0 échec. L’empreinte de route est identique à celle du premier retest corrigé.

## Commentaire rédigé

Contrôle complémentaire préparé après le premier retest : le même test vérifie maintenant huit mauvais mots de passe de longueur valide (401), puis le refus après épuisement du quota email (429). Avec les deux connexions correctes, les dix unités email sont consommées ; les vingt requêtes au total restent sous le quota IP de trente. Ce complément a été exécuté avec succès ; sa preuve est liée dans la section Retest. Le test est désormais inclus dans scripts/test-db.mjs et attend le mode fixed par défaut. Le résultat ci-dessus correspond à l’exécution réelle de l’élève.

J'ai reproduit un blocage temporaire de connexion : après des mots de passe trop courts, le serveur refusait le bon mot de passe avec 429. La protection contre les tentatives répétées intervenait avant la validation des données. J’ai appliqué le correctif qui conserve la limite IP et place la validation avant le quota email. J’ai rejoué le scénario : les neuf mots de passe trop courts sont toujours refusés avec 400, puis le bon mot de passe est accepté avec 200. Le correctif bloque donc le scénario reproduit. Cette conclusion ne signifie pas que tout risque de blocage associé à une politique anti-bruteforce a disparu.

Référence générale : [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), compromis entre verrouillage de compte et déni de service. La preuve propre au projet est le test lié ci-dessus.
