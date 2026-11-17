# R1 — Extension de couverture de VULN-001 : révocation et tickets

## Statut

Extension de VULN-001 reproduite personnellement, corrigée et retestée le 17 novembre 2026. Le scénario de désactivation sur les changements de statut est bloqué après correction. Ce résultat ne couvre pas encore toutes les autres opérations du lot R1 et n’est pas compté comme une quatrième faille indépendante.

## Observation et localisation

PATCH /tickets/:id/status vérifie la session et la permission dans les middlewares. Le service transmet ensuite le périmètre d'accès et actorId au dépôt, qui n'a pas sessionId et ne relit pas le rôle/statut de l'acteur dans la transaction. Le journal ajouté pour VULN-003 améliore l'attribution des actions mais ne revalide pas leur autorisation.

## Scénario à vérifier

Un agent commence une modification autorisée. Le test suspend la requête après les middlewares, juste avant sa transaction. Un Super Admin désactive l'agent et termine cette opération ; GET /auth/me de l'agent doit alors renvoyer 401. La première requête est ensuite libérée. Elle pourrait encore modifier le ticket et créer sa trace d'audit malgré la révocation déjà terminée.

La suspension est un crochet uniquement dans le test, comme pour les invitations. Elle rend l'ordre déterministe mais ne mesure pas la probabilité de gagner une course en usage normal. Une opération déjà commitée avant la révocation n'est pas concernée. Le test n'affirme pas qu'un token invalide dès l'arrivée permet d'accéder à la route.

## Preuve préparée

tests/audit-ticket-revocation.test.mjs utilise HTTP réel, PostgreSQL et un schéma temporaire. Comptes fictifs, emails simulés, IA non injectée. Mode vulnerable : attend une modification 200 et CLOSED après un contrôle /auth/me=401. Mode fixed : attend 403, ticket OPEN et aucune nouvelle trace de changement de statut. Aucune de ces valeurs attendues n'est présentée comme résultat observé avant exécution.

## Impact et réparation envisagés

Si le scénario est confirmé : un ancien agent peut terminer une modification initiée avant sa désactivation. Ce serait une extension de l'impact de VULN-001 aux tickets, sans accès anonyme ni nouveau compte privilégié démontré.

La correction devrait recontrôler l'acteur et sa session sous verrou, dans la transaction, avant toute modification du ticket, en conservant une acquisition cohérente des verrous et l'audit atomique. Les variantes de révocation et les parcours IA devront être examinés dans la même famille de couverture. Aucun résultat de correction ou retest n'est encore disponible.

## Reproduction personnelle obtenue

Le 17 novembre 2026 à 14:35:34 UTC (15:35:34 à Paris), l’élève a exécuté le scénario : [preuve brute](preuves/R1-tickets-avant-eleve.txt). /auth/me de l’agent désactivé est refusé avec 401, mais sa requête déjà en cours donne 200, fait passer le ticket OPEN → CLOSED et crée une trace de changement de statut. Le journal attribue donc l’action, mais ne suffit pas à garantir l’autorisation. Bilan : 1 test réussi, 0 échec en mode vulnerable. C’est une extension confirmée de VULN-001 aux tickets, sans nouvelle numérotation indépendante.

## Correction exécutée par l’élève

scripts/fix-r1-tickets.mjs prépare le passage de sessionId du contrôleur au service puis au dépôt. Un helper ticket-authorization.ts relit le compte et sa session sous le même verrou que les révocations, contrôle la permission actuelle et les expirations, puis recalcule le périmètre de visibilité. Le ticket est ensuite verrouillé, modifié et journalisé dans la transaction existante. Le script adapte l’appel direct au dépôt dans le test IA. L’élève a exécuté le script, le formatage et la compilation avant le retest ci-dessous.

## Retest personnel après correction

Non-régression réalisée ensuite : [21 tests sans base réussis, 8 scénarios DB ignorés, zéro échec](preuves/R1-tickets-tests-eleve.txt) et [8 scénarios PostgreSQL réussis, zéro échec ni scénario ignoré](preuves/R1-tickets-tests-db-eleve.txt). Cette dernière exécution du 17 novembre, autour de 15:04 UTC, valide la suite complète après ce correctif. Les mentions d'exécution en attente dans les notes préparatoires sont conservées comme historique et dépassées par ce résultat.

Exécuté le 17 novembre 2026 à 14:50:08 UTC (15:50:08 à Paris) : [preuve brute](preuves/R1-tickets-apres-eleve.txt). Résultat : revokedAgentMeHttp=401, pendingOperationHttp=403, statusBefore=OPEN, statusAfter=OPEN, ticketAuditRows=0, errorCode=FORBIDDEN. Un test réussi, zéro échec. Empreinte SHA-256 du dépôt : dbb08f42c3c04723aa03ecf2c6dfebb596cc278f9a3984e9297eb112216cf617.

Avant correction, l’opération suspendue obtenait 200 et fermait le ticket ; après correction elle est refusée avec 403. Le compte et sa session sont désormais relus dans la transaction sous verrou. La révocation terminée avant l’écriture est prise en compte. Aucune modification réussie du ticket n’est journalisée puisque cette opération est refusée. Cela ne signifie pas que les tentatives refusées sont ajoutées à l’audit.

Le test est intégré à scripts/test-db.mjs et attend désormais le mode fixed par défaut. La suite complète comporte huit scénarios PostgreSQL ; son exécution après ce dernier correctif reste à faire. Les variantes de rétrogradation/logout et les parcours IA ne sont pas déduits de cette seule preuve.
