# Sécurité

## Authentification et autorisation

- Better Auth gère les comptes e-mail/mot de passe et les sessions persistées dans PostgreSQL.
- Les cookies sont `HttpOnly`, `SameSite=Lax` et `Secure` en production.
- Le mot de passe minimal est de 12 caractères dans la configuration actuelle.
- `proxy.ts` est une redirection optimiste. Chaque mutation sensible revalide la session et
  `OrganizationMember` côté serveur.
- Les erreurs renvoyées au navigateur restent génériques. Les détails sont destinés aux logs serveur
  assainis.

Le cookie de démonstration n’est accepté que lorsque `NEXT_PUBLIC_DEMO_MODE=true`. Il ne doit jamais être
activé sur une instance de production contenant des données réelles.

## Secrets

Les clés OpenAI/Postiz/S3, les secrets de session et les tokens sociaux ne possèdent aucun préfixe
`NEXT_PUBLIC_`. Ils ne sont accessibles que dans le worker ou les routes serveur. `redactSecrets`
expurge les clés dont le nom ressemble à `authorization`, `token`, `secret`, `password` ou `apiKey`.

La clé Postiz reste dans les secrets Railway et n’est jamais persistée dans `SocialAccount`. En mode
réel, `POSTIZ_ORGANIZATION_ID` lie cette clé à un seul tenant ; `POSTIZ_GROUP_ID` peut limiter les
intégrations visibles. Une future offre multi-client devra stocker des credentials OAuth propres à
chaque organisation, chiffrés avec une clé gérée par KMS et soumis à rotation.

## Crawler et SSRF

Le crawler :

- accepte uniquement `http`/`https` et les hôtes exacts `yokosushi.fr`, `www.yokosushi.fr` ;
- résout le DNS et rejette loopback, IP privées, link-local, multicast, IPv6 locale et métadonnées cloud ;
- revalide chaque redirection manuelle ;
- n’explore aucun lien externe, sous-domaine `dev` ou route d’administration ;
- limite pages, concurrence, délais, taille, redirections, retries et timeout ;
- conserve les erreurs par page au lieu d’abandonner l’import complet.

L’allowlist JSON est limitée à `/api/famille`, `/api/famille/{id numérique}`, `/api/boutique` et
`/api/boutique2`.

## Fichiers

- MIME déterminé par signature et extension non considérée comme preuve.
- Formats image limités, maximum de 25 Mo et dimensions vérifiées.
- Originaux immuables ; recadrages en variantes.
- Aucun hotlink : les médias validés sont copiés dans le stockage de l’application.
- Le stockage local est interdit en production Railway ; les médias passent par Supabase Storage.

## Publication

- Garde `APPROVED` obligatoire avant Postiz.
- Une tentative possède une clé métier d’idempotence locale.
- Postiz ne documentant pas de clé d’idempotence, un timeout ambigu n’est jamais renvoyé automatiquement.
- Les payloads et réponses enregistrés sont expurgés.
- Les retries utilisent un backoff progressif uniquement pour les erreurs certaines et transitoires.

## Renforcement recommandé

- Activer la protection de mots de passe compromis et la vérification e-mail.
- Ajouter une limitation distribuée Redis sur inscription/connexion/import/génération.
- Ajouter RLS Supabase en défense supplémentaire après stabilisation des migrations.
- Utiliser un gestionnaire de secrets et une politique de rotation.
- Ajouter CSP stricte, Sentry avec scrubbing et journaux d’audit exportables.
