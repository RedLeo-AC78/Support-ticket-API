# R1 — Extension à l'assistance IA : contrôle avant réservation

## Statut

Dernière vérification personnelle : les suites complètes après correction ont réussi le 17 novembre 2026. [21 tests sans base réussis et 9 scénarios DB ignorés](preuves/R1-ia-tests-eleve.txt), puis [9 scénarios PostgreSQL réussis](preuves/R1-ia-tests-db-eleve.txt), aucun échec. Le parcours légitime IA simulé et le refus après désactivation sont inclus. Les mentions antérieures de non-régression en attente décrivent la préparation et sont dépassées par cette exécution.

Scénario avant réservation reproduit personnellement, corrigé et retesté avec succès le 17 novembre 2026. Voir les preuves avant/après en fin de fiche. Famille de VULN-001 : autorisation périmée entre contrôle HTTP et écriture. Ne pas compter une nouvelle vulnérabilité indépendante sans cause distincte.

## Observation

POST /tickets/:id/ai/retry vérifie la permission de traitement dans le routeur, puis appelle ticketAiService.analyze avec l'acteur issu du middleware. Le service ne reçoit pas sessionId et ne revalide pas son compte dans la transaction qui réserve l'analyse.

## Scénario prévu

Un agent demande une analyse sur un ticket visible. Le test suspend la requête avant la première transaction IA, après les contrôles HTTP. Un Super Admin termine la désactivation de l'agent et GET /auth/me confirme le refus 401. La requête IA est ensuite libérée.

Le test relève son statut HTTP, le nombre d'appels au fournisseur simulé, l'état TicketAi et les traces TICKET_AI_REQUESTED. Avant correction, le comportement suspecté est 200, un appel simulé et ANSWERED ; après correction, le comportement attendu serait 403, zéro appel et aucune analyse créée. Le ticket doit rester OPEN dans les deux cas : ce parcours ne résout pas automatiquement un ticket.

## Portée de la preuve

tests/audit-ai-revocation.test.mjs utilise un serveur HTTP local, une base réelle dans un schéma temporaire et des comptes fictifs. Le fournisseur est injecté et simulé : aucune clé OpenAI utilisée et aucun crédit dépensé. Le proxy de test provoque un ordre déterministe ; il ne mesure pas la probabilité de la course en usage normal.

Ce scénario vérifie uniquement une révocation terminée avant la réservation et avant l'appel fournisseur. Il ne faut pas le confondre avec une demande légitimement réservée avant une révocation, un appel externe déjà envoyé, la confirmation du propriétaire ou une rétrogradation de rôle. Ces variantes ne sont pas exécutées par ce test.

## Conséquence possible et correction à étudier

Une analyse pourrait être déclenchée au nom d'un acteur déjà désactivé, avec écriture et transmission du titre/description au fournisseur. Le test n'envoie rien à un tiers et ne mesure donc aucune fuite réelle ni dépense réelle.

Si le comportement est reproduit, contrôler sous verrou l'acteur, sa session, sa permission et son périmètre actuel avant de réserver l'analyse. Définir également la politique pour les résultats revenant après révocation, sans garder une transaction ouverte pendant un appel réseau. Aucun correctif ni résultat après correction n'est affirmé à cette étape.

## Extension R1 IA : preuve personnelle avant correction

Le 17 novembre 2026 à 15:26:32 UTC (16:26:32 à Paris), l’élève a reproduit l’analyse déclenchée après désactivation : [preuve brute](preuves/R1-ia-avant-eleve.txt). La session de l’agent est refusée (401), mais la requête déjà en cours obtient 200, appelle une fois le fournisseur simulé et enregistre ANSWERED avec une trace TICKET_AI_REQUESTED. Le ticket reste OPEN. Un test réussi, zéro échec en mode vulnerable. Aucun fournisseur réel, dépense ou envoi externe n’a été utilisé. Cette variante prolonge VULN-001 ; elle n’est pas comptée comme une quatrième faille indépendante.

Le script scripts/fix-r1-ai.mjs est préparé pour revalider sous verrou compte, session, permission et périmètre avant réservation. Il distingue l’analyse automatique du ticket de son créateur et la relance réservée aux agents autorisés. À cette étape, il n’est pas exécuté et aucun retest après correction n’est affirmé. Les retours de résultats après un appel déjà réservé et la confirmation du propriétaire restent hors de cette preuve ciblée.

## Retest personnel R1 IA — réservation après désactivation

L’élève a exécuté le correctif scripts/fix-r1-ai.mjs, le formatage et la compilation, puis rejoué le test le 17 novembre 2026 à 15:39:37 UTC (16:39:37 à Paris) : [preuve brute](preuves/R1-ia-apres-eleve.txt). Résultats observés : revokedAgentMeHttp=401, pendingOperationHttp=403, providerCalls=0, aiState=null, aiRequestAuditRows=0 ; ticket OPEN conservé. Bilan : 1 test réussi, zéro échec. L’empreinte du service corrigé est 6e7137ebf25636b7eb0c09face539af91ba7bb450334fbc367c54b019394a61a.

Avant correction, une analyse était lancée malgré la désactivation terminée. J’ai appliqué le contrôle sous verrou de l’acteur, de sa session et de ses permissions avant réservation. Après correction, la demande est refusée avant tout appel au fournisseur simulé et aucune analyse n’est créée. Aucun appel OpenAI ni crédit n’a été utilisé pour ces preuves.

Le test est désormais inclus dans scripts/test-db.mjs avec le comportement corrigé attendu par défaut ; la suite comprend neuf scénarios PostgreSQL. Sa non-régression complète après ce dernier correctif reste à exécuter. Ce résultat couvre la désactivation avant réservation : le retour d’un appel déjà lancé et la confirmation du propriétaire ne sont pas validés par ce scénario. Les mentions précédentes de préparation sont historiques, dépassées pour cette variante par l’exécution constatée ici.
