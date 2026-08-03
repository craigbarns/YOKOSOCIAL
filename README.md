# YokoSushi Social Agent

Application SaaS indépendante pour analyser les contenus publics de YokoSushi, préparer des
publications Instagram et Facebook, les faire valider par un responsable puis les programmer avec
Postiz.

Postiz reste uniquement le moteur de connexion et de publication. Ce dépôt n’est ni un fork de
Postiz, ni une modification de son code source.

## Parcours couvert

Le parcours réel suit cette séquence :

```text
yokosushi.fr
→ import HTTP/API dans un worker dédié
→ copie et contrôle des médias dans le stockage de l’application
→ validation humaine des établissements, produits, prix et photos
→ génération de cinq brouillons structurés
→ édition et aperçu Instagram/Facebook
→ approbation explicite de la version courante
→ création de tâches BullMQ
→ programmation Postiz mock ou réelle
→ rapprochement du statut distant
```

Une modification après approbation crée une nouvelle version, remet la publication en `DRAFT` et
annule l’approbation précédente. L’import, la génération et les synchronisations ne publient jamais
directement.

Un second parcours de démonstration fonctionne hors ligne, sans PostgreSQL, Redis, Supabase, OpenAI
ou Postiz. Ses données sont toujours marquées fictives.

## Architecture de production

```text
GitHub
  │
  ├── Railway / web Next.js ───────────┐
  ├── Railway / worker BullMQ ─────────┼──► Supabase PostgreSQL
  └── Railway / Redis ◄────────────────┘
                     │
                     ├──► yokosushi.fr (allowlist stricte)
                     ├──► Supabase Storage compatible S3
                     ├──► OpenAI Responses API
                     └──► API publique Postiz
```

- `apps/web` : Next.js App Router, React, Better Auth, interface et API courtes ;
- `apps/worker` : crawl, ingestion média, génération IA et publication, sans contrainte serverless ;
- Supabase : PostgreSQL managé et stockage objet ;
- Railway : web, worker et Redis dans le même projet ;
- Postiz : connexion aux comptes sociaux et programmation seulement.

Le web et le worker utilisent Prisma côté serveur. Supabase Auth et l’API REST Supabase ne sont pas
utilisés.

## Monorepo

```text
apps/
  web/                 Next.js, Better Auth, routes et interfaces
  worker/              consommateurs BullMQ long-lived
packages/
  ai/                  ContentGenerationService, OpenAI et mock
  config/              variables Zod et expurgation des secrets
  database/            Prisma, migrations, seed et helpers multi-tenant
  media/               téléchargement, MIME, hashes, qualité et stockage
  postiz/              interface, provider réel et provider mock
  shared/              schémas métier, jobs et workflow
  ui/                  composants React
  website-importer/    crawler HTTP/API sécurisé et mock
docs/                  architecture et procédures
docker/                images Railway web et worker
tests/e2e/             parcours navigateur de démonstration
```

Toutes les entités métier sont rattachées à une `Organization`. Les routes réelles vérifient la
session, l’appartenance et le rôle avant toute lecture ou mutation.

## Prérequis

- Node.js `22.18.0` (`.nvmrc`) ;
- npm `10.8.x` ;
- Docker Compose pour PostgreSQL et Redis locaux ;
- Chromium Playwright pour l’E2E ;
- un projet Supabase et un projet Railway pour la production.

```bash
nvm install
nvm use
npm install
```

## Démonstration hors ligne

Les valeurs par défaut de développement activent le mode fictif :

```bash
npm run dev:web
```

Ouvrir <http://localhost:3000>. Le parcours comprend deux établissements fictifs, plusieurs produits
et médias locaux, cinq publications, la validation humaine et une programmation Postiz simulée.

Variables correspondantes :

```dotenv
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
AI_MODE=mock
POSTIZ_MODE=mock
```

Ce mode utilise `localStorage` pour l’état fonctionnel et un cookie de démonstration `HttpOnly`. Il ne
doit jamais être présenté comme un import réel de YokoSushi.

## Installation locale réelle

### 1. Configurer l’environnement

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
```

Pour les conteneurs locaux :

```dotenv
DATABASE_URL=postgresql://yokosocial:yokosocial_dev_only@localhost:5432/yokosocial?schema=public
DIRECT_URL=postgresql://yokosocial:yokosocial_dev_only@localhost:5432/yokosocial?schema=public
REDIS_URL=redis://localhost:6379
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
AUTH_SECRET=une-valeur-aleatoire-de-32-caracteres-minimum
BETTER_AUTH_SECRET=une-autre-valeur-aleatoire-de-32-caracteres-minimum
ENCRYPTION_KEY=une-cle-de-32-octets-encodee-en-base64
```

Générer les secrets avec un gestionnaire dédié ou, localement :

```bash
openssl rand -base64 32
```

### 2. Démarrer les services et la base

```bash
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
```

Le seed est idempotent et entièrement fictif. Il ne supprime aucune donnée.

### 3. Lancer le web et le worker

```bash
npm run dev
```

Ou séparément :

```bash
npm run dev:web
npm run dev:worker
```

Le worker a besoin de `DATABASE_URL` et `REDIS_URL` pour consommer les tâches réelles.

## Variables d’environnement

La liste exhaustive et commentée se trouve dans `.env.example`.

| Groupe              | Variables principales                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Application         | `NODE_ENV`, `APP_URL`, `DEMO_MODE`, `NEXT_PUBLIC_DEMO_MODE`                                                |
| Supabase PostgreSQL | `DATABASE_URL`, `DIRECT_URL`                                                                               |
| Authentification    | `AUTH_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                                     |
| OpenAI              | `AI_MODE`, `OPENAI_API_KEY`, `OPENAI_MODEL`                                                                |
| Postiz              | `POSTIZ_MODE`, `POSTIZ_BASE_URL`, `POSTIZ_API_KEY`, `POSTIZ_ORGANIZATION_ID`, `POSTIZ_GROUP_ID`            |
| Stockage            | `STORAGE_MODE`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` |
| Import              | `YOKOSUSHI_WEBSITE_URL`, `WEBSITE_IMPORT_MODE`, `CRAWLER_*`, `PLAYWRIGHT_ENABLED`                          |
| Worker              | `REDIS_URL`, `WORKER_CONCURRENCY`                                                                          |
| Sécurité            | `ENCRYPTION_KEY`                                                                                           |

Aucune clé ne doit porter le préfixe `NEXT_PUBLIC_`. Seuls les indicateurs non sensibles destinés au
navigateur peuvent l’utiliser.

## Supabase

### PostgreSQL

Pour les processus Railway persistants, utiliser Supavisor en mode session sur le port `5432` comme
`DATABASE_URL`. Utiliser une connexion directe, ou un pooler compatible migrations, comme
`DIRECT_URL`.

Appliquer les migrations depuis un runner de confiance avant le déploiement applicatif :

```bash
npm ci
npm run db:deploy
```

Ne jamais lancer `prisma migrate dev` sur la production.

### Storage

Le MVP attend un bucket public dédié aux seuls médias éditoriaux destinés à être affichés et publiés.
Il ne doit contenir aucune donnée privée. Activer l’interface S3 de Supabase puis renseigner :

```dotenv
STORAGE_MODE=s3
S3_ENDPOINT=https://PROJECT_REF.storage.supabase.co/storage/v1/s3
S3_REGION=REGION_DU_PROJET
S3_BUCKET=yokosocial-media
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_PUBLIC_URL=https://PROJECT_REF.supabase.co/storage/v1/object/public/yokosocial-media
```

Le worker télécharge les images YokoSushi, contrôle leur type réel, calcule SHA-256 et dHash, analyse
leurs dimensions et crée sa propre copie. Aucun hotlink n’est utilisé. Les originaux ne sont jamais
modifiés ou supprimés automatiquement.

## Import réel de `yokosushi.fr`

`YokoSushiHttpCrawlerProvider` limite toutes les navigations aux hôtes exacts :

```text
yokosushi.fr
www.yokosushi.fr
```

Le provider :

- valide DNS, IP et chaque redirection contre les SSRF ;
- refuse localhost, les réseaux privés, les métadonnées cloud, les ports et domaines non autorisés ;
- respecte `robots.txt`, les délais, limites de concurrence, timeouts, tailles et retries ;
- lit le HTML, Open Graph, JSON-LD, images lazy, `srcset` et CSS ;
- utilise les APIs publiques `/api/boutique`, `/api/famille` et `/api/famille/{id}` ;
- conserve chaque valeur avec sa source, sa date, sa confiance et sa validation ;
- continue après une erreur partielle.

Les produits détectés ne comportent pas toujours d’association fiable à un établissement. Cette
association doit alors rester à vérifier. Prix, adresses, téléphones, horaires et promotions ne sont
jamais appliqués sans décision humaine.

Voir [docs/yokosushi-import.md](docs/yokosushi-import.md).

## Génération IA

`ContentGenerationService` reçoit uniquement le profil de marque et les établissements, produits et
médias validés du tenant sélectionné. Toutes les sorties repassent par Zod et les identifiants inconnus
sont rejetés.

```dotenv
AI_MODE=real
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
```

Le provider OpenAI utilise la Responses API avec Structured Outputs, `store: false` et un identifiant
de sécurité dérivé par hash. L’identifiant interne de l’organisation n’est pas envoyé en clair comme
identité utilisateur. Le provider mock produit des résultats déterministes sans réseau.

Les publications générées restent en `DRAFT`. Aucune sortie du modèle n’est directement transmise à
Postiz.

Voir [docs/ai-content-generation.md](docs/ai-content-generation.md).

## Postiz

Les comptes sociaux sont synchronisés depuis l’API publique Postiz. L’application conserve uniquement
leurs identifiants d’intégration et métadonnées non sensibles ; la clé Postiz reste une variable
serveur.

```dotenv
POSTIZ_MODE=real
POSTIZ_BASE_URL=https://api.postiz.com/public/v1
POSTIZ_API_KEY=...
POSTIZ_ORGANIZATION_ID=id-de-l-organisation-yokosushi
# Facultatif, recommandé si votre espace Postiz comporte plusieurs groupes
POSTIZ_GROUP_ID=id-du-groupe-yokosushi
```

La clé serveur est liée à une seule organisation applicative par
`POSTIZ_ORGANIZATION_ID`. Une autre organisation ne peut ni synchroniser ses intégrations, ni lancer
un job avec cette clé. Utiliser une clé Postiz dédiée à YokoSushi ; `POSTIZ_GROUP_ID` permet en plus
de limiter la synchronisation au groupe YokoSushi.

Le pipeline journalise chaque tentative sans token. Une réponse réseau ou distante ambiguë devient
`UNCERTAIN` et n’est jamais renvoyée automatiquement avant rapprochement. Le mock simule comptes,
upload, programmation, succès, erreur et état incertain.

Dans le MVP, la programmation automatisée concerne les images et carrousels. Les Stories et Reels
sont préparés sous forme de trames, scripts et médias suggérés ; aucune vidéo complexe n’est générée.

Voir [docs/postiz-integration.md](docs/postiz-integration.md).

## Commandes

| Commande               | Effet                                            |
| ---------------------- | ------------------------------------------------ |
| `npm install`          | Installe le monorepo                             |
| `docker compose up -d` | Lance PostgreSQL et Redis locaux                 |
| `npm run db:generate`  | Génère Prisma                                    |
| `npm run db:migrate`   | Crée/applique les migrations de développement    |
| `npm run db:deploy`    | Applique les migrations existantes en production |
| `npm run db:seed`      | Charge les données fictives idempotentes         |
| `npm run dev`          | Lance web et worker                              |
| `npm run dev:web`      | Lance uniquement Next.js                         |
| `npm run dev:worker`   | Lance uniquement BullMQ                          |
| `npm run format:check` | Vérifie Prettier                                 |
| `npm run lint`         | Exécute ESLint                                   |
| `npm run typecheck`    | Vérifie TypeScript strict                        |
| `npm run test`         | Exécute Vitest                                   |
| `npm run test:e2e`     | Exécute Playwright en mode mock                  |
| `npm run build`        | Construit tous les workspaces                    |

## Tests

La suite couvre notamment :

- schémas Zod et transitions de validation ;
- authentification et autorisations multi-tenant ;
- crawler, `robots.txt`, redirections et protections SSRF ;
- contrôle MIME, SHA-256, dHash, doublons et score média ;
- providers OpenAI et Postiz avec transports injectés ;
- import et ingestion asynchrones ;
- refus des secrets dans les messages BullMQ ;
- parcours E2E compte → import → génération → approbation → programmation mock.

Les tests automatiques n’appellent ni YokoSushi, ni OpenAI, ni Postiz. Les tests contractuels live
doivent rester opt-in et utiliser des comptes sans enjeu.

## GitHub puis Railway

Le dépôt doit d’abord être publié sur GitHub, puis connecté à deux services Railway.

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git add .
git commit -m "feat: initialize YokoSushi Social Agent"
git remote add origin git@github.com:VOTRE_COMPTE/yokosushi-social-agent.git
git push -u origin main
```

Ne jamais ajouter `.env`, une exportation de base, des clés ou des tokens au commit. Le dépôt est
`UNLICENSED` : ne le rendre public qu’avec l’accord du propriétaire.

Dans Railway, créer :

1. Redis avec `maxmemory-policy=noeviction` ;
2. `yokosocial-web`, Config File Path `/railway.web.json` ;
3. `yokosocial-worker`, Config File Path `/railway.worker.json` ;
4. les références communes vers Supabase et Redis ;
5. un domaine public uniquement pour le web.

Laisser `Root Directory` vide pour les deux services. Les Dockerfiles utilisent la racine du
monorepo. Appliquer les migrations Supabase avant de promouvoir une version qui modifie le schéma.

Voir [docs/railway-deployment.md](docs/railway-deployment.md).

## Sécurité et limites actuelles

- authentification Better Auth et cookies sécurisés en production ;
- contrôles d’origine sur les mutations authentifiées ;
- rôles `OWNER`, `ADMIN`, `EDITOR`, `REVIEWER`, `VIEWER` ;
- séparation stricte par `organizationId` dans les routes et workers ;
- secrets exclus des payloads BullMQ et expurgés des erreurs ;
- médias limités et contrôlés par leur signature réelle ;
- publication impossible sans approbation de la version courante ;
- absence de répétition automatique après un état Postiz incertain.

Avant une ouverture au public, il reste nécessaire de réaliser des tests live avec les propres comptes
Supabase, OpenAI et Postiz de YokoSushi, une revue de sécurité externe, une vérification des droits de
réutilisation des médias, ainsi que l’observabilité, les sauvegardes et la rotation des secrets.

Ne sont pas inclus dans ce MVP : facturation, application mobile native, réponses automatiques,
publication sans validation, agence/white-label et génération vidéo avancée.

## Documentation

- [Architecture](docs/architecture.md)
- [Plan technique](docs/technical-plan.md)
- [Import YokoSushi](docs/yokosushi-import.md)
- [Génération IA](docs/ai-content-generation.md)
- [Intégration Postiz](docs/postiz-integration.md)
- [Traitement des médias](docs/media-processing.md)
- [Sécurité](docs/security.md)
- [Base de données](docs/database.md)
- [Tests](docs/testing.md)
- [Déploiement Railway](docs/railway-deployment.md)
