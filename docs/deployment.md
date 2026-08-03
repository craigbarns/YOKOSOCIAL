# Déploiement GitHub → Supabase → Railway

La cible retenue utilise :

- GitHub comme source et porte d'entrée CI ;
- Supabase pour PostgreSQL et le stockage objet S3-compatible ;
- Railway pour l'interface Next.js, le worker BullMQ et Redis.

Le mode de production n'utilise ni Vercel, ni PostgreSQL Railway, ni stockage local persistant.
Consulter le [guide Railway détaillé](railway-deployment.md) avant de créer les services.

## 1. Publier sur GitHub

Depuis la racine du dépôt :

```bash
git status
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git add .
git commit -m "feat: initialize YokoSushi Social Agent MVP"
git remote add origin git@github.com:VOTRE_COMPTE/yokosushi-social-agent.git
git push -u origin main
```

Ne jamais commiter `.env`, un export Supabase, des médias privés ou un état d'authentification
Playwright. Le workflow `.github/workflows/ci.yml` doit être vert avant toute promotion.

## 2. Préparer Supabase

### PostgreSQL

1. Créer le projet Supabase dans une région proche des services Railway.
2. Créer un utilisateur PostgreSQL applicatif dédié.
3. Utiliser Supavisor en mode session sur le port 5432 pour le runtime long-lived Railway.
4. Réserver la connexion directe, ou l'URL prévue à cet effet, à Prisma Migrate.
5. Appliquer les migrations avec `prisma migrate deploy` depuis un runner de confiance.

Le runner final de l'image web actuelle n'embarque pas Prisma et les migrations. Aucune commande
Railway `preDeployCommand` n'est donc activée. Voir la procédure et la condition d'activation future
dans [railway-deployment.md](railway-deployment.md#5-supabase-postgresql).

Référence : [Supabase avec Prisma](https://supabase.com/docs/guides/database/prisma).

### Storage

Pour le MVP, créer un bucket public dédié aux seuls médias éditoriaux, activer le protocole S3 et
générer une paire d'accès réservée au serveur. Le worker utilise ensuite `STORAGE_MODE=s3` avec
l'endpoint direct, la région, le bucket, `S3_PUBLIC_URL` et les clés fournies par Supabase.

Référence :
[authentification S3 de Supabase Storage](https://supabase.com/docs/guides/storage/s3/authentication).

## 3. Créer les services Railway

Créer un projet contenant :

```text
yokosocial-web
yokosocial-worker
Redis
```

Les deux services applicatifs utilisent le même dépôt GitHub et conservent un contexte de build à la
racine du monorepo. Dans leurs réglages, laisser **Root Directory vide** et saisir les Config File Path
absolus suivants :

| Service             | Config File Path       |
| ------------------- | ---------------------- |
| `yokosocial-web`    | `/railway.web.json`    |
| `yokosocial-worker` | `/railway.worker.json` |

Le web est construit par `docker/web.Dockerfile`, expose `/api/health` et utilise une politique de
redémarrage sur erreur. Le worker est construit par `docker/worker.Dockerfile`, n'a ni domaine ni
healthcheck HTTP et utilise `restartPolicyType=ALWAYS` avec un délai d'arrêt de 30 secondes.

La documentation Railway confirme que le chemin du fichier Config as Code est absolu et indépendant
du Root Directory : [déploiement des monorepos](https://docs.railway.com/deployments/monorepo).

## 4. Relier Redis

Ajouter Redis depuis le canvas Railway puis définir sur le web et le worker :

```dotenv
REDIS_URL=${{Redis.REDIS_URL}}
```

Vérifier `maxmemory-policy=noeviction` avant d'activer BullMQ. Redis reste privé au projet Railway ;
aucun proxy TCP public n'est nécessaire.

Référence : [Railway Redis](https://docs.railway.com/databases/redis).

## 5. Configurer les variables

Ajouter les valeurs de `.env.example` dans l'environnement Railway de production, notamment :

```dotenv
NODE_ENV=production
APP_URL=https://social.votre-domaine.fr
DATABASE_URL=postgresql://URL_SUPABASE_RUNTIME
AUTH_SECRET=...
ENCRYPTION_KEY=...
DEMO_MODE=false
NEXT_PUBLIC_DEMO_MODE=false
BETTER_AUTH_URL=https://social.votre-domaine.fr
BETTER_AUTH_SECRET=...
REDIS_URL=${{Redis.REDIS_URL}}
STORAGE_MODE=s3
S3_ENDPOINT=https://PROJECT_REF.storage.supabase.co/storage/v1/s3
S3_REGION=...
S3_BUCKET=yokosocial-media
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
AI_MODE=mock
POSTIZ_MODE=mock
# Obligatoire lors du passage à POSTIZ_MODE=real, dans le web et le worker
POSTIZ_ORGANIZATION_ID=
POSTIZ_GROUP_ID=
```

Sceller les secrets. Ne jamais ajouter de secret sous un nom `NEXT_PUBLIC_*`. Activer OpenAI et
Postiz séparément, uniquement après leurs tests contractuels live.

## 6. Appliquer les migrations puis déployer

Depuis un runner de confiance possédant le dépôt, Node 22.18 et les secrets Supabase :

```bash
npm ci
DATABASE_URL="..." DIRECT_URL="..." npm run db:deploy --workspace @yokosocial/database
```

Déployer ensuite le commit sur Railway. Dans chaque détail de déploiement, vérifier le Config File
Path et le Dockerfile réellement utilisés. Générer un domaine public uniquement pour le web.

## 7. Vérifications après déploiement

- `/api/health` répond HTTP 200 sur le domaine web ;
- l'inscription crée une session sécurisée ;
- les mutations inter-organisations sont refusées ;
- le worker reste actif, se connecte à Redis et traite un job de test ;
- une publication non approuvée est refusée ;
- le stockage écrit une copie dans le bucket public réservé aux médias éditoriaux ;
- Postiz et OpenAI restent en mode mock jusqu'à validation de leurs comptes réels.

Le healthcheck Railway n'est exécuté qu'au moment du déploiement. Ajouter une surveillance continue,
des alertes worker/queue, des sauvegardes et une procédure de rotation des secrets avant le trafic
réel.
