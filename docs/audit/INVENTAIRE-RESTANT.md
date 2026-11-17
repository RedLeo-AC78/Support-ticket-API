# Inventaire de revue et plan de travail restant

Date : 17 novembre 2026. Code examiné : commit d1f1ccc, après les trois correctifs d'audit. Cette étape est une revue de code : aucun nouveau test d'exploitation, aucun scan réseau et aucun appel IA réel n'ont été exécutés. Aucun correctif applicatif n'a été ajouté pendant cette étape.

## Comment lire les nombres

- 3 constats précédemment reproduits et corrigés : VULN-001, VULN-002 et VULN-003. Leurs preuves et limites sont dans le rapport.
- 3 groupes de risques à vérifier maintenant, et 1 contrôle complémentaire de dépendances : **4 lots de travail**, pas quatre nouvelles failles démontrées.
- Certaines nouvelles observations prolongent une cause déjà traitée ; elles enrichiront la même fiche si la preuve le confirme, au lieu d'être comptées comme des failles indépendantes.
- Une revue de code ne peut pas garantir un nombre total et définitif de vulnérabilités. Cet inventaire borne le travail de cette passe d'audit, pas toutes les recherches possibles.

## Tableau de planification

Les durées sont des estimations de travail actif à deux, incluant préparation, exécution et lecture de la preuve initiale. Elles ne comprennent pas encore une correction éventuelle et ses retests, ni les pauses ou problèmes d'environnement.

| Lot | Observation et conséquence possible | Statut | Priorité | Vérification estimée |
|---|---|---|---|---|
| R1 | Portée des contrôles de révocation/expiration sur les opérations sensibles encore en cours | Piste de concurrence, apparentée à VULN-001 | 1 | 45–90 min |
| R2 | Le quota IP commun à login/refresh/logout pourrait empêcher une déconnexion valide | Piste de disponibilité, apparentée à la famille de risques de quota de VULN-002 | 2 | 25–45 min |
| R3 | Le serveur annoncé comme localhost ne précise pas d'adresse d'écoute et utilise HTTP | Configuration à vérifier dans le contexte scolaire | 2 | 20–40 min |
| R4 | Vérification actuelle des avis de sécurité des dépendances et de leur applicabilité | Contrôle complémentaire ; aucun avis actuel affirmé | 3 | 15–30 min |

Total de vérification : environ **1 h 45 à 3 h 25**. Prévoir **30 à 45 minutes** pour consolider le rapport, les preuves et la non-régression. Si plusieurs pistes exigent des corrections, réserver **environ 2 à 3 heures supplémentaires** ; une course complexe ou une mise à jour majeure peut dépasser cette réserve. Pour organiser le travail, prévoir **environ 4 à 7 heures actives**, en plusieurs séances, puis réévaluer après les premières preuves. Si les pistes sont écartées, le temps sera plus court. Ce n'est pas une promesse de durée.

## R1 — Révocation et expiration : terminer la couverture

### Indices dans le code

Le helper invitation-authorization.ts recontrôle le compte et sa session sous verrou. En revanche, la mise à jour d'un statut de ticket reçoit actorId pour l'audit, mais pas sessionId, et n'effectue pas cette relecture. Le service ticket-ai.service.ts utilise aussi l'acteur transmis par le middleware sans revalider la session avant les écritures. Le service users.service.ts recontrôle la session et son expiration absolue mais pas accessExpiresAt ; l'expiration de l'access token est contrôlée uniquement par le middleware initial.

### Ce que cela pourrait permettre

Une requête déjà authentifiée pourrait continuer à écrire après la fin d'une révocation ou après expiration de son access token, si la modification n'a pas encore été validée. Une réponse IA lente pourrait aussi revenir après la révocation de son demandeur. Cela ne signifie pas qu'un utilisateur anonyme ou un token déjà invalide au début de la requête peut accéder aux routes.

### Preuve à préparer

Reprendre le principe déterministe de VULN-001 : suspendre après le middleware et avant la transaction, terminer la révocation via une autre requête, puis libérer l'opération. Commencer par le changement de statut ; étendre aux opérations IA pertinentes avec fournisseur simulé. Tester séparément l'expiration pendant l'attente d'une opération administrative. Vérifier l'ordre exact : la révocation doit être terminée avant la validation de l'action. Ne pas qualifier d'attaque une opération déjà commitée avant la révocation.

### Décision de classement

Si reproduit, il s'agit probablement d'une **extension de couverture de VULN-001**, pas automatiquement de VULN-004. Les endpoints et variantes réussis ou refusés seront listés dans la fiche. Aucun test de ce lot n'est exécuté à ce stade.

## R2 — La déconnexion partage le quota des connexions

### Indices dans le code

auth.routes.ts réutilise la même instance byIp (30 requêtes / 15 min) sur login, refresh et logout. Elle intervient avant l'authentification métier, y compris pour des entrées invalides. Une IP partagée par une classe partage aussi cette limite.

### Ce que cela pourrait permettre

Après épuisement du quota par des requêtes invalides, un logout avec refresh token valide pourrait recevoir 429 avant de révoquer la session. Une session laissée active resterait alors potentiellement utilisable. Les limites temporaires sont prévues par l'application ; le point à examiner est leur effet sur une fonction de sécurité, et non le simple fait d'obtenir un 429.

### Preuve à préparer

Créer une session fictive, atteindre le quota avec un petit nombre borné de requêtes sur le serveur éphémère, appeler logout avec le vrai refresh token du compte de test, puis vérifier en base et via /auth/me si la session est encore utilisable. Ne pas utiliser de session personnelle. Un seul client local suffit pour établir l'effet de partage de compteur ; cela ne prouvera pas un scénario multi-IP.

### Correction éventuelle

Séparer les compteurs et garantir une voie de révocation bornée, sans supprimer les protections anti-abus. Choisir le correctif après la preuve et documenter les limites inhérentes aux IP partagées. Cette piste est liée aux quotas, mais ne correspond pas au scénario de mots de passe trop courts déjà corrigé dans VULN-002.

## R3 — Exposition réseau et transport HTTP

### Indices dans le code

server.ts appelle app.listen(port, callback) sans host et affiche une URL localhost. Selon [la documentation Node.js](https://nodejs.org/api/net.html#serverlisten), l'absence de host entraîne une écoute sur l'adresse non spécifiée IPv6 (::) ou IPv4 (0.0.0.0), selon le système. Le serveur Express utilise HTTP.

### Risque contextualisé

L'affichage de localhost ne garantit pas une restriction à la machine locale. Selon le pare-feu et le réseau, l'API pourrait être joignable depuis d'autres machines. Si des identifiants ou tokens transitent sur un réseau en HTTP, ils ne bénéficient pas du chiffrement TLS. Aucune accessibilité distante ni interception n'a été démontrée. HTTP sur la boucle locale d'un exercice n'est pas assimilé à une exposition publique.

### Preuve à préparer

Vérifier l'adresse effectivement liée au processus et le protocole local, sans scanner le réseau de l'école ni capturer des identifiants. La table d'écoute peut démontrer un bind large mais ne prouve pas à elle seule que le pare-feu autorise un accès externe. Définir le besoin : usage local uniquement ou démonstration sur réseau autorisé. Pour le premier cas, un host explicite 127.0.0.1 peut suffire ; un déploiement partagé demanderait un dispositif HTTPS approprié.

## R4 — Dépendances

### État actuel

Une précédente installation npm ci affichait zéro vulnérabilité à cette date. Cela ne remplace pas une interrogation datée du registre concernant le package-lock courant. Aucune CVE ou dépendance exploitable supplémentaire n'est affirmée dans cet inventaire.

### Contrôle à préparer

Faire exécuter npm audit --json, conserver la sortie brute et distinguer dépendances d'exécution et de développement. Pour chaque avis éventuel, examiner version installée, chemin de dépendance, code atteignable et scénario applicable. Un avis de scanner ne devient pas automatiquement une fiche d'exploitation. Ne pas lancer npm audit fix --force automatiquement ni mettre à jour une version majeure sans analyse.

## Limites connues : à documenter, pas à transformer en failles sans preuve

| Limite observée | Traitement proposé pour le devoir |
|---|---|
| Quotas IP/email et quotas IA en mémoire, remis à zéro au redémarrage | Documenter l'usage à une instance ; stockage partagé seulement si le périmètre le justifie |
| Les quotas IA ne garantissent pas un plafond de dépense du compte du professeur | Documenter ; aucun appel payant ou test d'épuisement nécessaire à l'inventaire |
| Pas de nettoyage périodique des sessions et tokens utilisés/expirés | Mentionner rétention et croissance ; ne pas annoncer de saturation non mesurée |
| Détecteur de secrets IA non exhaustif, erreurs de classement et injection de prompt possibles | Documenter les frontières d'autorité ; évaluation sur tickets fictifs distincte, avec coût annoncé si vrai modèle |
| File email en mémoire et audit non immuable pour l'administrateur PostgreSQL | Limites déjà acceptées du projet ; pas de refonte professionnelle imposée |
| Une nouvelle demande forgot-password invalide les codes précédents | Choix de politique à discuter ; pas déclaré faille sans besoin et impact démontrés |
| SHA/versions, schémas JSON et en-têtes de sécurité | Leur présence/absence ne prouve pas à elle seule une exploitation ; éviter les listes génériques hors contexte |

## Contrôles déjà couverts : pas à refaire intégralement sans raison

Les preuves précédentes et la suite ont exercé la signature et l'expiration JWT, le rejeu de refresh tokens, la propriété des tickets, plusieurs permissions, la validation, les entrées SQL de recherche/tri, les codes à usage unique et l'atomicité des journaux. Ces résultats restent limités aux cas exécutés. L'inventaire vise les lacunes de couverture, pas la répétition systématique de tous les tests.

## Ordre et fin de cette passe

1. R1 : preuve et décision sur la couverture de révocation, avec variantes regroupées.
2. R2 : preuve et décision sur la déconnexion après saturation de quota.
3. R3 : constater la configuration réseau et appliquer seulement ce que nécessite l'exercice.
4. R4 : audit daté des dépendances et analyse des résultats éventuels.
5. Pour chaque point : preuve avant, correction si justifiée, preuve après, puis non-régression et mise à jour du rapport. Faire la pause de commit convenue après chaque lot traité.

Cette passe peut être clôturée lorsque ces quatre lots ont une décision documentée : confirmé et corrigé, écarté par preuve, ou limite acceptée avec justification. Les points écartés restent visibles dans le rapport. La clôture n'est pas une certification d'absence de toute vulnérabilité ; toute nouvelle recherche ultérieure est une extension explicitement annoncée.
