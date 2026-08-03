# @yokosocial/database

Couche PostgreSQL multi-tenant de YokoSushi Social Agent, conçue pour Prisma 7 et Supabase.

## Connexions Supabase

- `DATABASE_URL` : URL Supavisor en mode session (`:5432`) pour les processus persistants Railway.
- `DIRECT_URL` : connexion PostgreSQL directe (`:5432`) ou Supavisor en mode session pour `prisma migrate`.
- Le navigateur ne reçoit jamais ces URL. Toutes les requêtes Prisma restent côté serveur.

`prisma.config.ts` utilise `DIRECT_URL` en priorité pour les migrations. Le client applicatif utilise toujours `DATABASE_URL` avec `@prisma/adapter-pg`.

Sans variable de connexion, la configuration CLI emploie une URL locale factice uniquement pour permettre `prisma generate`, `npm install` et les builds sans secrets. `db:migrate`, `db:deploy`, `db:push`, `db:seed` et `db:studio` exécutent un garde et exigent explicitement `DIRECT_URL` ou `DATABASE_URL` avant tout accès à PostgreSQL.

Les commandes du workspace chargent un éventuel `packages/database/.env` local, puis le fichier `.env` situé à la racine du monorepo. Une variable déjà injectée par Railway/Supabase n’est jamais écrasée par ces fichiers.

## Commandes

Depuis la racine du monorepo :

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

Pour un déploiement contrôlé, exécuter `npm run db:deploy --workspace @yokosocial/database` dans une étape distincte avant le déploiement applicatif. Ne jamais lancer `prisma migrate dev` en production.

## Multi-tenant

Chaque entité métier possède directement `organizationId` et un index associé. Les associations à plusieurs restaurants passent par des tables de liaison explicites (`SocialPostEstablishment`, `MediaAssetEstablishment`, `MenuItemEstablishment`, etc.) qui portent aussi `organizationId`.

Toute route doit :

1. résoudre l’organisation à partir de la session et de `OrganizationMember` ;
2. ajouter `organizationScope(organizationId)` à la requête ;
3. vérifier que les entités liées appartiennent à la même organisation avant une mutation.

Le schéma Prisma ne remplace pas les contrôles d’autorisation applicatifs. Si Supabase est aussi interrogé via son API REST, ajouter des politiques RLS avant d’exposer la moindre table ; l’application MVP utilise Prisma exclusivement côté serveur.

## Données importées

`ImportedData` conserve la valeur brute, la page source, la date de récupération, la confiance et le statut de validation. Les informations critiques ne deviennent des champs normalisés d’un établissement, produit ou promotion qu’après validation humaine.

Les médias conservent leurs sources, deux hashes, leurs métadonnées techniques et leurs variantes. La contrainte unique `(organizationId, sha256)` bloque les doublons binaires exacts sans supprimer les variantes perceptuellement proches.

## Seed de démonstration

Le seed est idempotent et ne supprime aucune donnée. Tous ses identifiants commencent par `demo_`, tous les noms affichables commencent par `[DÉMO]`, les URL de source fictives utilisent `demo.invalid`, et les modèles principaux portent `isDemo = true`. Il crée :

- une organisation et un responsable fictifs ;
- deux établissements fictifs ;
- deux produits et cinq médias placeholders fictifs ;
- cinq publications générées fictives ;
- deux comptes sociaux et une programmation Postiz mock.

Ces données ne proviennent pas de `yokosushi.fr` et ne doivent jamais être présentées comme réelles.
