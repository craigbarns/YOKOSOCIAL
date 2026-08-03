# Base de données

## Vue d’ensemble

YokoSushi Social Agent utilise PostgreSQL via Supabase et Prisma ORM 7.9.1. Le schéma se trouve dans `packages/database/prisma/schema.prisma`. Le client applicatif utilise `@prisma/adapter-pg` et reste strictement côté serveur.

La base est conçue dès le départ pour plusieurs organisations et plusieurs établissements par marque. Supabase fournit PostgreSQL managé ; l’authentification applicative est assurée par Better Auth et non par Supabase Auth dans le MVP.

## Organisation du schéma Prisma

Les modèles sont répartis par domaine :

- identité : `User`, `Session`, `Account`, `Verification` ;
- multi-tenant : `Organization`, `OrganizationMember` ;
- restaurant : `RestaurantBrand`, `Establishment`, `BrandProfile` ;
- import du site : `WebsiteImport`, `WebsiteImportPage`, `ImportedData` ;
- médiathèque : `MediaAsset`, `MediaVariant`, `MediaTag`, `MediaAssetTag`, `MediaAssetEstablishment` ;
- carte : `ProductCategory`, `MenuItem`, `MenuItemEstablishment`, `Promotion`, `PromotionEstablishment` ;
- contenu : `ContentCampaign`, `ContentCampaignEstablishment`, `ContentIdea`, `ContentIdeaEstablishment` ;
- publication : `SocialAccount`, `SocialPost`, `SocialPostVersion`, `SocialPostMedia`, `SocialPostEstablishment` ;
- programmation : `PublicationJob`, `PublicationAttempt` ;
- amélioration continue : `AnalyticsSnapshot`, `UserFeedback`, `AuditLog`.

Les statuts métier sont représentés par des enums PostgreSQL. Le workflow d’une publication suit notamment `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `SCHEDULED`, `PUBLISHING`, `PUBLISHED`, `REJECTED`, `FAILED` et `CANCELLED`.

## Isolation multi-tenant

Chaque entité métier porte directement `organizationId`, y compris les tables de liaison. Les index correspondants permettent de filtrer efficacement les requêtes par organisation.

Une ressource pouvant concerner plusieurs restaurants utilise une table de liaison explicite :

- `SocialPostEstablishment` pour les publications ;
- `MediaAssetEstablishment` pour les médias ;
- `MenuItemEstablishment` pour la disponibilité et le prix local des produits ;
- `PromotionEstablishment` pour les promotions ;
- `ContentCampaignEstablishment` et `ContentIdeaEstablishment` pour la planification éditoriale.

Une route privée doit toujours :

1. obtenir l’utilisateur depuis sa session Better Auth ;
2. vérifier son appartenance à l’organisation avec `OrganizationMember` ;
3. ajouter `organizationId` à chaque lecture ou mutation Prisma ;
4. vérifier que les objets reliés appartiennent à la même organisation avant leur association ;
5. vérifier explicitement l’établissement avant d’utiliser une adresse, un horaire, un téléphone, un prix ou un service local.

Le package exporte `organizationScope`, `assertOrganizationId` et `assertSameOrganization` afin de rendre ces contrôles explicites. Les identifiants CUID sont uniques globalement, mais ils ne remplacent pas le filtrage par organisation.

Le schéma ne fournit pas encore de politiques Supabase Row Level Security. Prisma doit donc rester inaccessible depuis le navigateur. Si une future version expose les tables avec l’API REST Supabase, des politiques RLS complètes devront être ajoutées et testées avant cette exposition.

## Better Auth

Les quatre tables principales attendues par Better Auth sont incluses :

- `User` contient l’identité applicative et l’état de vérification de l’adresse e-mail ;
- `Session` contient un token unique, son expiration et les métadonnées de connexion ;
- `Account` relie les fournisseurs d’identité ou les identifiants par mot de passe ;
- `Verification` stocke les vérifications temporaires.

`OrganizationMember` relie un utilisateur à une organisation avec l’un des rôles `OWNER`, `ADMIN`, `EDITOR`, `REVIEWER` ou `VIEWER`. Un même utilisateur peut appartenir à plusieurs organisations sans partager leurs données.

Les tokens des comptes sociaux ne sont pas stockés dans les tables Better Auth. `SocialAccount.credentialsEncrypted` est réservé aux données chiffrées côté serveur. Aucun secret ne doit apparaître dans `metadata`, les payloads de publication, les journaux ou les réponses API.

## Connexions Supabase

Deux URL sont prévues :

```dotenv
# Runtime Railway long-lived : Supavisor en mode session
DATABASE_URL=postgresql://USER:PASSWORD@REGION.pooler.supabase.com:5432/postgres

# Prisma CLI : connexion directe ou Supavisor en mode session
DIRECT_URL=postgresql://USER:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

`DATABASE_URL` est utilisée par le client applicatif avec `@prisma/adapter-pg`. `DIRECT_URL` est prioritaire dans `prisma.config.ts` pour les migrations.

Les environnements sans IPv6 peuvent utiliser le pooler Supavisor en mode session pour `DIRECT_URL`. Les deux URL doivent être stockées dans les variables Railway ou le runner de migration, jamais dans Git.

Pour permettre `npm install`, `prisma generate` et un build de démonstration sans secrets, la configuration Prisma possède une URL locale factice de repli. Cette URL ne donne accès à aucune base. Un garde distinct bloque `db:migrate`, `db:deploy`, `db:push`, `db:seed` et `db:studio` tant que `DIRECT_URL` ou `DATABASE_URL` n’est pas réellement définie.

## Provenance et validation des imports

`ImportedData` sépare les données détectées des données métier validées. Chaque valeur conserve notamment son type, sa valeur brute, sa page source, sa confiance, sa date de récupération et son statut de validation.

Les prix, horaires, adresses, téléphones, promotions et suppressions de produits sont considérés comme critiques. Ils doivent être approuvés avant de modifier les modèles normalisés correspondants.

`MediaAsset` conserve l’URL et la page source, les dimensions, le type MIME, le poids, le hash SHA-256, le hash perceptuel, les classifications, les scores de qualité et l’historique d’utilisation. La contrainte unique `(organizationId, sha256)` empêche un doublon binaire exact dans une organisation. Une ressemblance perceptuelle est signalée pour révision mais ne provoque aucune suppression automatique.

## Index principaux

Le schéma comprend les index demandés sur les champs pertinents :

- `organizationId` et `establishmentId` ;
- `status` et `scheduledAt` ;
- `sourceUrl` ;
- `sha256` et `perceptualHash` ;
- `externalId` ;
- `createdAt`.

Des contraintes uniques couvrent également les adhésions organisationnelles, les slugs dans leur périmètre, les associations multi-établissements, les versions de publication et les clés d’idempotence du provider de publication.

## Migrations

La migration initiale PostgreSQL est versionnée dans `packages/database/prisma/migrations`. En développement :

```bash
npm run db:generate
npm run db:migrate
```

En production, appliquer uniquement les migrations déjà versionnées :

```bash
npm run db:deploy --workspace @yokosocial/database
```

La migration de production doit être une étape contrôlée de la livraison. Elle ne doit pas être exécutée automatiquement par chaque instance web ou worker. Une sauvegarde Supabase et une revue des opérations destructives sont requises avant toute migration supprimant ou transformant des données.

## Seed de démonstration

Le seed s’exécute avec :

```bash
npm run db:seed
```

Il est idempotent et ne supprime aucune donnée existante. Il crée une organisation, un utilisateur, deux établissements, deux produits, cinq médias, cinq publications et deux comptes sociaux simulés.

Toutes ces données sont identifiables :

- les identifiants commencent par `demo_` ;
- les noms visibles commencent par `[DÉMO]` ;
- les modèles principaux portent `isDemo = true` ;
- les fausses pages sources utilisent le domaine réservé `demo.invalid` ;
- l’import porte le mode `DEMO` et des avertissements explicites.

Ces enregistrements ne proviennent pas de `yokosushi.fr` et ne doivent jamais être présentés comme des informations réelles.

## Validations effectuées

La couche base de données a été vérifiée avec :

- `prisma validate` sous Prisma 7.9.1 ;
- `prisma generate` sans `DATABASE_URL`, pour vérifier le démarrage d’un clone frais ;
- TypeScript strict sur le client, les gardes et le seed ;
- vérification du formatage Prisma et Prettier ;
- comparaison de la migration initiale avec le diff du schéma ;
- assertions unitaires sur les gardes multi-tenant ;
- test du refus des commandes de base sans URL et de leur acceptation avec une URL explicite.

Prisma 7.9.1 et Vitest 4 doivent être exécutés sous une version Node prise en charge, par exemple Node 22.18. Le `.nvmrc` du dépôt sélectionne Node 22.

## Limites actuelles

Les contrôles suivants nécessitent encore un projet Supabase de développement ou une base PostgreSQL locale :

- appliquer la migration complète et vérifier son rollback opérationnel ;
- exécuter le seed puis contrôler les relations avec des requêtes d’intégration ;
- tester les connexions directe, session et transaction Supavisor ;
- mesurer la concurrence et l’utilisation des connexions sur les services Railway ;
- tester les sauvegardes et restaurations ;
- ajouter et valider des politiques RLS si l’API Supabase est utilisée ;
- effectuer les tests d’autorisation multi-tenant contre une vraie base.

Ces limites n’empêchent pas la génération du client ou le build, mais elles doivent être levées avant la mise en production avec des données réelles.
