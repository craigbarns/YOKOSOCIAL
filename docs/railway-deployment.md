# Déploiement Railway : web, worker et Redis

Ce guide cible l'architecture de production suivante :

```text
GitHub
  ├── Railway / yokosocial-web     ──► Supabase PostgreSQL
  ├── Railway / yokosocial-worker  ──► Supabase PostgreSQL + Storage
  └── Railway / Redis              ◄── web + worker
```

Supabase reste le fournisseur PostgreSQL et objet. Railway héberge deux services applicatifs issus du
même dépôt GitHub et un service Redis. Aucun PostgreSQL Railway ni volume média Railway n'est requis.

Références officielles :

- [Railway — Config as Code](https://docs.railway.com/config-as-code/reference)
- [Railway — monorepos](https://docs.railway.com/deployments/monorepo)
- [Railway — Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway — healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Railway — commande de pré-déploiement](https://docs.railway.com/deployments/pre-deploy-command)
- [Railway — politiques de redémarrage](https://docs.railway.com/deployments/restart-policy)
- [Railway — Redis](https://docs.railway.com/databases/redis)
- [BullMQ — recommandations de production](https://docs.bullmq.io/guide/going-to-production)
- [Supabase — Prisma](https://supabase.com/docs/guides/database/prisma)
- [Supabase Storage — authentification S3](https://supabase.com/docs/guides/storage/s3/authentication)

## Configurations suivies dans Git

| Service Railway     | Config File Path       | Dockerfile                 | Exposition publique |
| ------------------- | ---------------------- | -------------------------- | ------------------- |
| `yokosocial-web`    | `/railway.web.json`    | `docker/web.Dockerfile`    | oui                 |
| `yokosocial-worker` | `/railway.worker.json` | `docker/worker.Dockerfile` | non                 |

Le slash initial du **Config File Path est obligatoire** : Railway attend un chemin absolu depuis la
racine du dépôt. Les fichiers de configuration sélectionnent explicitement le builder `DOCKERFILE` et
le Dockerfile propre à chaque service.

Ce dépôt est un monorepo npm partagé. Dans les deux services, laisser **Root Directory vide**. Ne pas
le régler sur `/apps/web`, `/apps/worker` ou `/docker` : le contexte de build doit contenir le
`package-lock.json` racine et tous les workspaces `packages/**` utilisés par les Dockerfiles.

## 1. Créer le projet Railway

1. Créer un projet Railway vide dans une région proche du projet Supabase.
2. Ajouter une base Redis avec `+ New` → `Database` → `Redis` et conserver le nom de service `Redis`.
3. Ajouter deux services depuis le même dépôt GitHub et la même branche de production.
4. Renommer ces services `yokosocial-web` et `yokosocial-worker`.
5. Ne pas ajouter de PostgreSQL Railway : `DATABASE_URL` pointera vers Supabase.

Railway fournit `REDIS_URL` sur le service Redis. Dans les variables du web et du worker, créer la
variable de référence suivante :

```dotenv
REDIS_URL=${{Redis.REDIS_URL}}
```

Le nom dans `${{Redis.REDIS_URL}}` doit correspondre exactement au nom du service sur le canvas.

BullMQ exige une politique d'éviction `noeviction`. Après création, vérifier la configuration depuis
un environnement d'administration autorisé :

```bash
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory-policy
```

Ne pas ouvrir Redis au réseau public pour les services applicatifs ; la référence `REDIS_URL` utilise
la connectivité fournie au sein du projet Railway.

## 2. Régler précisément le service web

Dans `yokosocial-web` → `Settings` :

1. `Source` : sélectionner le dépôt et la branche de production.
2. `Root Directory` : laisser le champ vide.
3. `Config as Code` / `Config File Path` : saisir exactement `/railway.web.json`.
4. Ne pas ajouter de Build Command ou Start Command dans le dashboard : la configuration choisit le
   Dockerfile, puis Railway respecte son `CMD`.
5. Dans `Networking`, générer un domaine Railway, puis ajouter le domaine YokoSushi lorsqu'il est prêt.

`railway.web.json` configure :

- `docker/web.Dockerfile` avec le contexte du dépôt complet ;
- le healthcheck `/api/health`, qui répond HTTP 200 sans dépendre d'un service externe ;
- 300 secondes au maximum pour rendre le nouveau déploiement sain ;
- redémarrage `ON_FAILURE`, dix tentatives au maximum ;
- dix secondes entre `SIGTERM` et `SIGKILL`.

Railway injecte `PORT`. Le serveur standalone Next.js doit écouter ce port sur `0.0.0.0`. Ne définir
manuellement `PORT` que si les logs prouvent que l'image ne reprend pas la valeur injectée.

Le healthcheck Railway sécurise uniquement l'activation d'un nouveau déploiement ; ce n'est pas une
surveillance continue. Ajouter ensuite un moniteur externe sur `/api/health`.

## 3. Régler précisément le worker

Dans `yokosocial-worker` → `Settings` :

1. `Source` : sélectionner le même dépôt et la même branche.
2. `Root Directory` : laisser le champ vide.
3. `Config as Code` / `Config File Path` : saisir exactement `/railway.worker.json`.
4. Ne définir ni Build Command ni Start Command dans le dashboard.
5. Ne générer aucun domaine public et ne configurer aucun healthcheck HTTP : le worker n'expose pas de
   serveur web.
6. Commencer avec une seule réplique tant que l'idempotence des processeurs réels n'a pas été validée.

`railway.worker.json` utilise `docker/worker.Dockerfile`, demande `restartPolicyType=ALWAYS` et laisse
30 secondes au worker BullMQ pour fermer ses connexions après `SIGTERM`. La politique `ALWAYS` n'est
pas disponible sur les offres Railway Free et Trial ; utiliser une offre qui la prend en charge pour
la production.

Il n'y a volontairement aucune commande de migration sur le worker.

## 4. Variables Railway

Créer les secrets dans l'environnement `production`. Utiliser des Shared Variables pour les valeurs
réellement communes, puis des variables de référence dans chaque service. Sceller les clés sensibles
après vérification ; les variables scellées ne sont pas copiées automatiquement vers les
environnements de pull request.

### Communes au web et au worker

```dotenv
NODE_ENV=production
DEMO_MODE=false
APP_URL=https://social.votre-domaine.fr
DATABASE_URL=postgresql://URL_SUPABASE_RUNTIME
AUTH_SECRET=...
ENCRYPTION_KEY=...
REDIS_URL=${{Redis.REDIS_URL}}

STORAGE_MODE=s3
S3_ENDPOINT=https://PROJECT_REF.storage.supabase.co/storage/v1/s3
S3_REGION=REGION_DU_PROJET
S3_BUCKET=yokosocial-media
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_PUBLIC_URL=https://PROJECT_REF.supabase.co/storage/v1/object/public/yokosocial-media

AI_MODE=mock
POSTIZ_MODE=mock
YOKOSUSHI_WEBSITE_URL=https://www.yokosushi.fr
WEBSITE_IMPORT_MODE=real
PLAYWRIGHT_ENABLED=true
```

Le schéma d'environnement actuel exige `AUTH_SECRET` et `ENCRYPTION_KEY` hors mode démo, y compris au
démarrage du worker. La clé OpenAI n’est nécessaire que dans le worker. En mode Postiz réel, la clé,
`POSTIZ_ORGANIZATION_ID` et l’éventuel `POSTIZ_GROUP_ID` sont nécessaires dans le web (synchronisation)
et le worker (publication), après validation live du provider.

### Web uniquement

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
BETTER_AUTH_URL=https://social.votre-domaine.fr
BETTER_AUTH_SECRET=...
```

`NEXT_PUBLIC_*` est intégré au bundle client pendant le build. Vérifier la valeur dans les logs du
déploiement et ne jamais y placer un secret.

### Worker uniquement

```dotenv
WORKER_CONCURRENCY=2
CRAWLER_MAX_PAGES=80
CRAWLER_CONCURRENCY=2
CRAWLER_DELAY_MS=750
CRAWLER_TIMEOUT_MS=15000
CRAWLER_MAX_REDIRECTS=3
```

Lorsque les providers réels sont raccordés :

```dotenv
AI_MODE=real
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
POSTIZ_MODE=real
POSTIZ_BASE_URL=https://api.postiz.com/public/v1
POSTIZ_API_KEY=...
POSTIZ_ORGANIZATION_ID=id-de-l-organisation-yokosushi
POSTIZ_GROUP_ID=id-du-groupe-yokosushi
```

`POSTIZ_ORGANIZATION_ID` doit être identique dans le web et le worker. Commencer en mode mock,
créer l’organisation YokoSushi, relever son ID dans l’espace applicatif, puis seulement renseigner
la liaison et activer le mode réel. Utiliser une clé Postiz dédiée à cette organisation.

## 5. Supabase PostgreSQL

Pour un processus Node long-lived, utiliser de préférence l'URL Supavisor en mode session sur le port
5432 comme `DATABASE_URL`. Garder l'URL directe, ou une autre URL prévue pour les migrations, dans le
secret `DIRECT_URL` de l'environnement qui exécute Prisma Migrate.

Le runner final de `docker/web.Dockerfile` contient le serveur Next.js standalone, mais pas le CLI
Prisma, le schéma ni les migrations. Le `preDeployCommand` Railway s'exécute dans cette image finale :
**aucune migration automatique n'est donc configurée dans `railway.web.json` actuellement**. Le worker
ne doit jamais devenir un second exécuteur de migrations.

Avant le premier déploiement et avant chaque version contenant une migration, exécuter dans un runner
de confiance qui possède le dépôt et ses dépendances :

```bash
npm ci
DATABASE_URL="..." DIRECT_URL="..." npm run db:deploy --workspace @yokosocial/database
```

Utiliser `prisma migrate deploy`, jamais `prisma migrate dev`, en production. Si une future image web
embarque explicitement Prisma, `packages/database/prisma.config.ts`, le schéma et les migrations, il
sera alors possible d'ajouter **uniquement à `railway.web.json`** :

```json
{
  "deploy": {
    "preDeployCommand": ["npm run db:deploy --workspace @yokosocial/database"]
  }
}
```

Railway n'exécute pas de nouveau déploiement si cette commande échoue. Tester d'abord la migration sur
une base de staging et conserver des migrations rétrocompatibles lorsque web et worker sont déployés
séparément.

## 6. Supabase Storage

1. Pour le MVP, créer un bucket public dédié `yokosocial-media`, contenant exclusivement les copies
   éditoriales publiques destinées aux réseaux sociaux. Ne jamais y placer de document interne ou de
   donnée client.
2. Dans Supabase `Storage` → `Configuration` → `S3`, activer le protocole S3.
3. Générer une paire Access Key / Secret Key réservée au serveur.
4. Copier l'endpoint direct et la région affichés par Supabase dans les variables Railway.
5. Renseigner `S3_PUBLIC_URL` avec l’URL publique exacte du bucket et vérifier qu’un objet de test est
   lisible sans exposer les identifiants S3.
6. Ne jamais préfixer les clés d’accès par `NEXT_PUBLIC_`.

Les clés S3 statiques Supabase contournent les politiques RLS et donnent accès aux opérations S3 des
buckets du projet. Les conserver uniquement dans les services serveur, les sceller et organiser leur
rotation. Supabase Storage n'offre pas de versioning S3 ; l'application ne doit donc jamais supprimer
automatiquement un original importé.

Un bucket privé et des URL signées constituent une évolution recommandée si l’application doit
ultérieurement gérer des contenus confidentiels. Le MVP attend aujourd’hui une URL publique pour les
aperçus et l’upload vers Postiz.

## 7. Ordre de mise en production

1. Faire passer format, lint, typecheck, tests et build dans GitHub Actions.
2. Appliquer les migrations Supabase depuis le runner de confiance.
3. Pousser ou promouvoir le commit vers la branche connectée à Railway.
4. Vérifier dans les logs de build web l'utilisation de `docker/web.Dockerfile`.
5. Vérifier dans les logs worker l'utilisation de `docker/worker.Dockerfile` et la connexion Redis.
6. Attendre le succès du healthcheck web avant de basculer le domaine public.
7. Tester une session réelle, l'isolation d'organisation et un job BullMQ sans publication réelle.
8. Garder OpenAI et Postiz en mode mock jusqu'aux tests contractuels séparés.

Dans les détails de chaque déploiement, l'icône de fichier de Railway permet de confirmer quelles
valeurs proviennent de la configuration suivie dans Git.

## Limites à lever avant trafic réel

- Les deux images Docker et les connexions Railway/Supabase n'ont pas été validées dans un projet
  Railway réel sans identifiants fournis.
- `docker/web.Dockerfile` épingle Node 22.18.0. L’image worker suit la distribution Node incluse dans
  l’image officielle Playwright 1.62.1 ; vérifier sa version effective dans les logs Railway.
- Les migrations ne sont pas automatiques avec l'image web actuelle.
- `/api/health` est un contrôle de processus, pas un test de disponibilité PostgreSQL ou Redis.
- Le worker n'expose pas de healthcheck ; ajouter une alerte sur l'ancienneté de son heartbeat ou des
  jobs en attente.
- Vérifier `maxmemory-policy=noeviction` sur Redis avant de traiter des jobs BullMQ.
- La remise de médias Supabase privés par URL signée et la rotation automatisée des clés restent à
  implémenter ; le bucket MVP doit rester strictement limité aux médias éditoriaux publics.
- Les providers OpenAI, Postiz et l'import live doivent rester désactivés tant que leurs tests de
  contrat réels n'ont pas été exécutés.
