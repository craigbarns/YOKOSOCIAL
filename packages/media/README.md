# `@yokosocial/media`

Pipeline serveur d'inspection, déduplication et stockage des images importées. Le package ne publie
jamais directement une URL source : il télécharge les octets, vérifie leur contenu puis enregistre une
copie dans un `MediaStorageProvider` contrôlé par l'application.

## Ingestion HTTP

`HttpMediaIngestionService` exécute le pipeline suivant :

```text
validation URL/DNS
→ GET sans cookies et redirections manuelles
→ revalidation de chaque redirection
→ lecture bornée en mémoire
→ détection MIME depuis les octets
→ dimensions et score heuristique
→ SHA-256 et dHash
→ recherche des doublons dans le périmètre organisation
→ copie vers MediaStorageProvider
→ persistance des métadonnées par MediaIngestionRepository
```

Le package dépend d'un petit contrat structurel `MediaUrlSecurityPolicy`. L'implémentation
`UrlSecurityPolicy` exportée par `@yokosocial/website-importer` satisfait directement ce contrat. Le
worker peut donc partager l'allowlist exacte, la résolution DNS et le blocage des IP privées sans
créer de dépendance du package média vers le crawler.

```ts
import { HttpMediaIngestionService, S3MediaStorageProvider } from "@yokosocial/media";
import { UrlSecurityPolicy, YOKOSUSHI_ALLOWED_HOSTS } from "@yokosocial/website-importer";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable requise absente : ${name}`);
  return value;
}

const securityPolicy = new UrlSecurityPolicy(YOKOSUSHI_ALLOWED_HOSTS);
const storage = new S3MediaStorageProvider({
  endpoint: requiredEnvironment("S3_ENDPOINT"),
  region: requiredEnvironment("S3_REGION"),
  bucket: requiredEnvironment("S3_BUCKET"),
  accessKeyId: requiredEnvironment("S3_ACCESS_KEY"),
  secretAccessKey: requiredEnvironment("S3_SECRET_KEY")
});

const service = new HttpMediaIngestionService({
  securityPolicy,
  repository,
  storage
});

const result = await service.ingest({
  organizationId: "org_yokosushi",
  sourceUrl: "https://www.yokosushi.fr/path/image.jpg",
  sourcePageUrl: "https://www.yokosushi.fr/la-carte"
});
```

## Bornes et contrôles

- HTTPS, hôte, port, identifiants URL et DNS sont délégués à la politique injectée ;
- `redirect: manual` garantit que chaque nouvelle destination repasse dans cette politique ;
- aucun cookie, identifiant, referrer ou cache navigateur n'est envoyé ;
- la taille est vérifiée avec `Content-Length` puis à nouveau pendant la lecture du flux ;
- la limite par défaut et maximale est de 25 Mio ;
- timeout, redirections et retries sont bornés ;
- JPEG, PNG, WebP et AVIF sont acceptés uniquement lorsque leur signature binaire est reconnue ;
- le MIME déclaré par le serveur est conservé comme provenance, mais seul le MIME réel pilote le
  stockage ;
- largeur, hauteur, ratio, canal alpha, luminosité, contraste et résolution alimentent le score ;
- les clés de stockage sont dérivées du SHA-256, pas du chemin distant ;
- les clés S3 sont adressées par SHA-256 et le provider local utilise une création exclusive ; une
  relance avec des octets strictement identiques est idempotente, tandis qu’un contenu divergent est
  refusé ; la détection exacte intervient avant tout appel au stockage.

## Déduplication et persistance

`MediaIngestionRepository` est une interface à implémenter dans la couche de données. Toutes ses
recherches reçoivent `organizationId` : un adapter ne doit jamais chercher un hash entre deux
organisations.

- `findExactDuplicates` recherche le SHA-256. Un doublon exact est retourné avec l'issue
  `EXACT_DUPLICATE` et n'est pas copié une seconde fois.
- `findPerceptualCandidates` présélectionne les dHash proches. Le service recalcule leur distance de
  Hamming et conserve seulement les résultats sous le seuil configuré.
- Un doublon perceptuel n'est ni supprimé ni rejeté : il est stocké comme variante potentielle avec
  le statut `NEEDS_REVIEW` et les correspondances sont transmises au repository.
- `create` reçoit la provenance, les hashes, l'inspection, le résultat du stockage et les doublons
  proches. Le contrat n'expose volontairement aucune méthode de suppression.

Le schéma Prisma déclare déjà une contrainte unique sur `(organizationId, sha256)`. L'adapter devra
traiter son éventuelle violation comme un doublon concurrent et rendre `create` idempotent avec la clé
du job.

## Tests

```bash
npm run lint --workspace @yokosocial/media
npm run typecheck --workspace @yokosocial/media
npm run test --workspace @yokosocial/media
npm run build --workspace @yokosocial/media
```

Les tests utilisent des réponses `fetch` injectées et des images créées localement par Sharp. Aucun
appel réseau live, stockage S3 réel ou base réelle n'est utilisé.

## Limites actuelles

- Le service doit être appelé par le worker et relié à un adapter `MediaIngestionRepository` ; aucun
  raccord PostgreSQL n'est fourni dans ce package.
- La politique URL empêche les destinations manifestement privées avant chaque requête, mais le
  `fetch` natif ne verrouille pas l'adresse IP résolue. Un proxy egress ou un agent HTTP avec DNS
  épinglé est recommandé en défense supplémentaire contre une attaque de DNS rebinding.
- Chaque fichier est chargé en mémoire dans la limite configurée. La concurrence globale et le débit
  d'un lot relèvent de BullMQ et du worker.
- Si le stockage réussit puis que `repository.create` échoue, un objet orphelin peut rester. Il ne doit
  pas être supprimé dans le chemin d'ingestion ; une tâche de réconciliation séparée, auditée et
  validée doit le traiter.
- La [compatibilité S3 de Supabase](https://supabase.com/docs/guides/storage/s3/compatibility) ne
  documente pas `If-None-Match` pour `PutObject`. Deux imports strictement concurrents peuvent donc
  réécrire la même clé déterministe avec les mêmes octets avant que la contrainte PostgreSQL tranche ;
  aucun original différent n'est supprimé.
- Le dHash est un signal rapide, pas une preuve : des recadrages importants peuvent être manqués et
  deux compositions simples peuvent produire un faux positif.
- Le score est heuristique. L’adapter calcule des potentiels initiaux par plateforme à partir de la
  qualité, du ratio et de la résolution, mais ne mesure pas encore précisément le flou, le cadrage du
  plat, le texte intégré ou les logos externes. Ces scores ne valent jamais approbation humaine.
- SVG, GIF animés, TIFF, PDF et vidéo sont refusés dans ce pipeline d'images du MVP.
- Le package n'accorde aucun droit de réutilisation : l'organisation doit confirmer les droits sur
  chaque média téléchargé.
