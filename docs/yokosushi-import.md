# Import de yokosushi.fr

Ce document décrit le provider `@yokosocial/website-importer`, sa politique de sécurité et
les hypothèses issues d’une reconnaissance publique effectuée les 2 et 3 août 2026.

L’import ne publie rien. Il prépare un résultat sourcé qui doit être revu avant d’être appliqué
à la base de données, particulièrement pour les médias, prix, promotions, horaires, adresses et
téléphones. Aucun score automatique ne vaut validation humaine.

## Providers

Le package expose l’interface `WebsiteCrawlerProvider` et deux implémentations :

- `YokoSushiHttpCrawlerProvider` : import réel, HTTP et API-first ;
- `MockWebsiteCrawlerProvider` : données entièrement fictives et explicitement préfixées
  `DÉMONSTRATION`.

```ts
import {
  MockWebsiteCrawlerProvider,
  YokoSushiHttpCrawlerProvider
} from "@yokosocial/website-importer";

const provider =
  process.env.WEBSITE_IMPORT_MODE === "mock"
    ? new MockWebsiteCrawlerProvider()
    : new YokoSushiHttpCrawlerProvider();

const result = await provider.crawl({
  websiteUrl: "https://www.yokosushi.fr",
  options: {
    maxPages: 40,
    maxFamilies: 30,
    maxStylesheets: 8,
    concurrency: 2,
    delayMs: 750,
    timeoutMs: 15_000,
    retries: 2,
    maxRedirects: 3,
    maxResponseBytes: 5_000_000,
    maxCssBytes: 1_000_000,
    userAgent: "YokoSushiSocialAgent/0.1 (+website content importer)"
  },
  onProgress(progress) {
    console.info(progress.stage, progress.completed, progress.total);
  }
});
```

Les dépendances `fetch`, DNS, horloge et temporisation sont injectables dans le constructeur.
Les tests les remplacent systématiquement par des fixtures locales : aucun test ne contacte
`yokosushi.fr`.

## Déroulement API-first

1. Validation de l’URL de départ et résolution DNS sécurisée.
2. Lecture de `/robots.txt`.
3. Import des établissements via `GET /api/boutique`.
4. Import de la liste des familles via `GET /api/famille`.
5. Import limité et concurrent des produits via `GET /api/famille/{id}`.
6. Analyse des pages HTML publiques, en partant de `/` et `/sitemap`.
7. Analyse d’un nombre limité de feuilles CSS internes.
8. Agrégation des résultats, avertissements et erreurs partielles.

Les seules routes JSON autorisées par le provider sont celles ci-dessus. Il ne découvre pas
automatiquement les routes `/api/*` trouvées dans les scripts.

`GET /api/produit/{id}` n’est pas utilisé : lors de la reconnaissance, cette route renvoyait
la page de connexion administrative sans session authentifiée.

## Structure du site observée

- [`robots.txt`](https://www.yokosushi.fr/robots.txt) autorisait l’exploration et ne déclarait
  aucun sitemap XML ;
- `/sitemap.xml` renvoyait 404 ;
- [`/sitemap`](https://www.yokosushi.fr/sitemap) est une page HTML ;
- les pages accueil, restaurants, zone de livraison, contact et franchise sont principalement
  disponibles dans le HTML initial ;
- [`/carte`](https://www.yokosushi.fr/carte) ne contient initialement que des composants Vue.
  Les catégories et produits sont chargés par les APIs publiques ci-dessus ;
- deux établissements étaient exposés : YokoSushi Compans et YokoSushi Péri ;
- les produits de l’API ne contenaient pas d’identifiant d’établissement.

Cette dernière contrainte est importante : un produit importé reçoit
`establishmentAssociation: "BRAND_LEVEL_REQUIRES_REVIEW"` et une liste d’établissements vide.
Il ne doit jamais être associé automatiquement à Compans ou Péri.

L’API boutiques observée semblait inverser ses champs `latitude` et `longitude`. Le provider
applique une correction heuristique uniquement lorsque l’inversion est manifeste, marque alors
`requiresReview: true`, et ajoute un avertissement. Cette valeur ne doit pas être publiée sans
validation.

Un smoke test volontairement limité exécuté le 3 août 2026 avec le provider réel a terminé sans
erreur : 2 établissements, 2 catégories limitées pour le test, 10 produits et 49 candidats médias.
Les APIs publiques exposaient alors 2 boutiques et 21 familles. Ce contrôle ne remplace ni un import
complet, ni la validation humaine des données obtenues.

## Visibilité et validation des produits

Les réponses de `/api/famille/{id}` contiennent également des produits non visibles sur la carte.
Le provider exclut :

- tout produit avec `cacher === true` ou `cacher === 1` ;
- tout produit dont `deleted_at` n’est pas vide.

Les prix promotionnels et badges sont conservés uniquement lorsqu’ils figurent dans la réponse,
mais restent soumis à validation humaine. Les champs `new`, les slogans de livraison et autres
promesses opérationnelles ne suffisent jamais à créer automatiquement une communication.

Le champ API `composants` n’est pas présenté comme une déclaration explicite d’allergènes. Il n’est
donc jamais copié dans `allergens`; une information allergène ne pourra être importée que depuis une
source qui la qualifie clairement comme telle.

Chaque catégorie, établissement et produit contient une `SourceReference` avec :

- URL source ;
- date locale de récupération ;
- pointeur JSON ou sélecteur lorsque disponible ;
- niveau de confiance ;
- statut de validation ;
- date de modification amont lorsqu’elle est fournie.

## Extraction des pages et médias

Le parseur HTML extrait :

- `title` et meta description ;
- liens internes et externes ;
- Open Graph ;
- JSON-LD, sans faire échouer la page lorsqu’une balise est invalide ;
- `img[src]`, `srcset`, `data-src`, `data-lazy-src` ;
- `picture`, `source`, poster vidéo ;
- `background-image` dans les attributs `style` et blocs `<style>` ;
- feuilles CSS internes, dans la limite configurée ;
- images référencées par les réponses JSON produits et catégories.

Les URLs relatives des photos produits sont résolues à la racine du site. Une URL externe est
conservée avec `isExternal: true` et `allowedForDownload: false`, mais elle n’est jamais explorée
ni téléchargée. Cela concerne notamment les anciennes images de catégories hébergées sur
`image.ibb.co`, les réseaux sociaux, Google Maps et les CDN.

L’Open Graph de l’accueil pointait vers `http://dev.yokosushi.fr`. Ce sous-domaine n’appartient
pas à l’allowlist exacte et reste donc une simple référence externe invalide.

Le package découvre les médias ; leur téléchargement, contrôle MIME réel, hash, déduplication,
analyse de dimensions et transfert S3 relèvent du package média et du worker.

## Sécurité SSRF

La liste blanche est exacte :

```text
yokosushi.fr
www.yokosushi.fr
```

Une URL est rejetée si elle utilise :

- un autre hôte ou un sous-domaine supplémentaire ;
- HTTP au lieu de HTTPS ;
- des identifiants intégrés ;
- un port autre que le port HTTPS standard ;
- une adresse DNS privée, locale, link-local, multicast, de documentation ou réservée.

Le DNS est résolu avant chaque requête et à nouveau avant chaque redirection. Les redirections
sont manuelles, limitées, et leur destination repasse par toutes les validations. Les corps de
réponse sont lus en flux avec une limite stricte, y compris lorsqu’un `Content-Length` est absent.
Les requêtes n’envoient ni cookies ni credentials et n’acceptent que `GET`.

La validation applicative ne remplace pas une politique réseau : en production, le worker doit
également disposer d’un filtrage egress interdisant les réseaux privés et les métadonnées cloud.

## Limites, retries et erreurs partielles

Le provider borne :

- tentatives de pages (réussies ou non), familles et feuilles CSS ;
- concurrence entre 1 et 5 ;
- intervalle entre les départs de requêtes ;
- timeout ;
- redirections ;
- nouvelles tentatives ;
- taille HTML/JSON et taille CSS.

Seuls les timeouts, erreurs réseau et statuts temporaires (`408`, `425`, `429`, `5xx` ciblés)
sont rejoués, avec temporisation progressive. Une erreur de famille, page ou CSS est ajoutée à
`errors` sans annuler les autres résultats. Le statut devient `PARTIALLY_COMPLETED` lorsqu’un
contenu exploitable subsiste, et `FAILED` uniquement lorsqu’aucun contenu n’a pu être importé.

## Playwright

Le provider actuel n’exécute pas Playwright. L’API publique rend le menu accessible sans navigateur
et doit rester la voie prioritaire. Si le site change ou si un contenu réellement interactif devient
indispensable, un provider Playwright séparé devra être exécuté dans le worker dédié, jamais dans
une fonction serverless courte.

## Tests

Dans le workspace :

```bash
npm run test --workspace @yokosocial/website-importer
npm run typecheck --workspace @yokosocial/website-importer
npm run lint --workspace @yokosocial/website-importer
```

Les tests couvrent :

- IP privées, métadonnées cloud, IPv4/IPv6 et DNS rebinding ;
- validation de chaque redirection ;
- extraction HTML, JSON-LD, Open Graph, lazy images, `srcset` et CSS ;
- schémas Zod des APIs ;
- filtrage des produits cachés et supprimés ;
- association établissement laissée à valider ;
- résultat partiel lorsqu’une famille échoue ;
- provider mock explicitement fictif ;
- parcours complet uniquement à partir de fixtures locales.

## Droits sur les contenus

Le respect de `robots.txt` n’accorde aucun droit de réutilisation. Les mentions légales du site
réservent les droits sur ses textes et images. YokoSushi doit confirmer son autorisation de copie
vers le stockage de l’application. Pour une future version SaaS, cette confirmation devra faire
partie de l’onboarding de chaque restaurant.
