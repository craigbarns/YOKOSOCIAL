# Intégration Postiz

## Rôle dans l'architecture

YokoSushi Social Agent reste propriétaire de ses contenus, validations, médias, dates et statuts
métier. Postiz est uniquement un moteur externe de connexion, programmation et publication.

Le domaine dépend de `SocialPublishingProvider`, jamais d'un SDK ou d'un DTO Postiz. Deux
implémentations sont fournies :

- `MockPostizProvider`, utilisable hors ligne et sans compte Postiz ;
- `RealPostizProvider`, client HTTP limité aux capacités garanties par l'API publique.

Le projet n'est ni un fork de Postiz, ni une modification de son code source.

## Sources officielles consultées

- [Vue d'ensemble de l'API publique](https://docs.postiz.com/public-api/introduction)
- [Spécification OpenAPI](https://docs.postiz.com/public-api/openapi.json)
- [Vérification de connexion](https://docs.postiz.com/public-api/integrations/is-connected)
- [Liste des intégrations sociales](https://docs.postiz.com/public-api/integrations/list)
- [Upload d'un fichier](https://docs.postiz.com/public-api/uploads/upload-file)
- [Création et programmation](https://docs.postiz.com/public-api/posts/create)
- [Liste des publications](https://docs.postiz.com/public-api/posts/list)
- [Changement de statut](https://docs.postiz.com/public-api/posts/change-status)
- [Suppression d'une publication](https://docs.postiz.com/public-api/posts/delete)
- [Paramètres Instagram](https://docs.postiz.com/public-api/providers/instagram)
- [Paramètres Facebook](https://docs.postiz.com/public-api/providers/facebook)
- [Analytics d'un compte](https://docs.postiz.com/public-api/analytics/platform)
- [Analytics d'une publication](https://docs.postiz.com/public-api/analytics/post)
- [Notifications](https://docs.postiz.com/public-api/notifications/list)
- [OAuth pour une future offre multi-client](https://docs.postiz.com/public-api/oauth)

Ces pages ont été vérifiées le 2 août 2026. L'API évolue : les tests contractuels doivent être
relancés avant d'activer le mode réel.

## Configuration

```dotenv
POSTIZ_MODE=mock
POSTIZ_BASE_URL=https://api.postiz.com/public/v1
POSTIZ_API_KEY=
POSTIZ_ORGANIZATION_ID=
POSTIZ_GROUP_ID=
```

Pour Postiz Cloud, la base officielle est `https://api.postiz.com/public/v1`. Pour une instance
auto-hébergée, elle est `https://{NEXT_PUBLIC_BACKEND_URL}/public/v1`.

Le constructeur réel refuse :

- une URL sans suffixe `/public/v1` ;
- les identifiants inclus dans l'URL ;
- HTTP par défaut ;
- une clé vide ;
- un timeout inférieur à 1 seconde ou supérieur à 120 secondes.

`allowInsecureHttp` existe uniquement pour un environnement local explicitement contrôlé. Il ne
doit jamais être activé en production.

En mode réel, `POSTIZ_ORGANIZATION_ID` est obligatoire dans le web et le worker. Il lie la clé
globale à l’organisation YokoSushi et bloque toute utilisation par un autre tenant. Si l’espace
Postiz contient plusieurs groupes, `POSTIZ_GROUP_ID` est transmis au filtre officiel `group` de la
liste des intégrations. Une future offre multi-client devra remplacer cette liaison par des
credentials OAuth chiffrés propres à chaque organisation.

### Authentification

La clé est placée telle quelle dans l'en-tête :

```http
Authorization: <api-key-ou-token-pos_...>
```

Il ne faut pas ajouter le préfixe `Bearer`. Les tests vérifient ce point. La clé reste exclusivement
côté serveur et doit être chiffrée en base lorsqu'elle devient propre à une organisation.

Une API key suffit pour le MVP YokoSushi. Pour une future offre SaaS multi-client, utiliser le flux
OAuth 2 Authorization Code documenté par Postiz, vérifier `state`, échanger le code côté serveur et
chiffrer le token retourné.

## Contrat du provider

```ts
interface SocialPublishingProvider {
  testConnection(): Promise<PostizConnectionStatus>;
  listIntegrations(options?): Promise<readonly PostizIntegration[]>;
  uploadMedia(input): Promise<UploadedMedia>;
  schedulePost(input): Promise<SchedulePostResult>;
  cancelScheduledPost(remotePostId): Promise<CancelScheduledPostResult>;
  listPosts(query): Promise<readonly PostizListedPost[]>;
  getPostStatus(input): Promise<RemotePostStatusResult>;
  getIntegrationAnalytics(integrationId, days): Promise<readonly AnalyticsMetric[]>;
  getPostAnalytics(remotePostId, days): Promise<readonly AnalyticsMetric[]>;
  listNotifications(page?): Promise<PostizNotificationsResponse>;
}
```

Toutes les entrées sensibles et toutes les réponses HTTP sont validées par Zod. Les schémas de
réponse tolèrent des propriétés supplémentaires afin de rester compatibles avec une extension
non cassante de l'API, mais exigent les champs utilisés par l'application.

## Séquence de programmation

```text
Publication approuvée
        │
        ├── charger la copie du média depuis le stockage de l'application
        ├── POST /upload pour chaque média
        ├── conserver id + path retournés
        └── POST /posts, une intégration cible par requête
                    │
                    ├── réponse validée ──> SCHEDULED + remotePostId
                    ├── erreur 4xx sûre ─> FAILED connu
                    └── timeout/5xx/réponse invalide
                                      └── UNKNOWN_REMOTE_STATE
                                          aucune répétition automatique
```

Le provider ne vérifie pas l'approbation métier : l'appelant doit appliquer `assertSchedulable`
avant tout appel à `schedulePost`.

Une requête est volontairement limitée à une intégration sociale. Cette granularité simplifie les
tentatives, l'audit et l'annulation séparée de Facebook et Instagram. Elle évite aussi le rayon
d'action dangereux de `DELETE /posts/{id}`, qui supprime tous les posts du même groupe.

### Payload envoyé

```json
{
  "type": "schedule",
  "date": "2026-08-05T18:00:00.000Z",
  "shortLink": false,
  "tags": [],
  "posts": [
    {
      "integration": { "id": "integration-id" },
      "value": [
        {
          "content": "Légende validée",
          "image": [{ "id": "upload-id", "path": "https://uploads.postiz.com/image.png" }]
        }
      ],
      "settings": { "__type": "instagram", "post_type": "post" }
    }
  ]
}
```

La réponse documentée est un tableau de `{ postId, integration }`. Chaque `postId` doit être
persisté séparément sur la tentative de publication correspondante.

### Formats pris en charge de façon sûre

- Instagram lié à Facebook : `__type: "instagram"` ;
- Instagram standalone : `__type: "instagram-standalone"` ;
- feed, image, carrousel ou Reel Instagram : `post_type: "post"` ;
- Story Instagram : `post_type: "story"` ;
- Reel : une seule vidéo MP4 ;
- Facebook image/carrousel : `__type: "facebook"`, avec `url` facultatif.

Un Reel reste encodé comme `post_type: "post"` dans l'API documentée. Le provider refuse les
Stories et Reels Facebook, dont le comportement n'est pas garanti par la documentation publique.

## Upload des médias

Le provider utilise `POST /upload` en `multipart/form-data` et laisse `FormData` construire la
boundary. Il n'envoie donc jamais manuellement l'en-tête `Content-Type` multipart.

Types acceptés par l'API documentée : JPEG, PNG, GIF, WebP, AVIF, BMP, TIFF et vidéo MP4. Les PDF
sont refusés. Le backend Postiz inspecte le contenu réel ; l'application doit néanmoins effectuer
ses propres contrôles MIME, extension, taille et sécurité avant l'appel.

Utiliser la copie S3 de YokoSushi, pas l'URL du site source. `POST /upload-from-url` n'est pas utilisé
par défaut afin de ne pas dépendre d'une URL publique et de ne pas recréer de hotlinking.

## Annulation conservatrice

L'annulation utilise exclusivement :

```http
PUT /posts/{id}/status
Content-Type: application/json

{"status":"draft"}
```

Une réponse valide doit confirmer `{ id, state: "DRAFT" }`. Le provider n'appelle jamais
automatiquement `DELETE /posts/{id}` car cet endpoint supprime toutes les publications appartenant
au même groupe.

Un timeout, un 5xx ou une réponse invalide pendant l'annulation produit également
`UNKNOWN_REMOTE_STATE`. L'application doit vérifier l'état avant toute nouvelle action.

## Absence d'idempotence distante

La documentation publique ne décrit aucune clé d'idempotence pour `POST /posts`. La protection
locale doit donc être transactionnelle :

1. créer un `PublicationJob` unique pour la version approuvée, la plateforme et la date ;
2. verrouiller la tentative avant l'appel ;
3. ne faire qu'un seul appel HTTP ;
4. persister immédiatement les IDs confirmés ;
5. classer tout résultat indéterminé en `UNKNOWN_REMOTE_STATE` ;
6. interdire toute répétition automatique tant qu'un opérateur n'a pas rapproché les données.

Le provider n'effectue aucun retry interne sur `schedulePost` ou `cancelScheduledPost`.

## Statut distant : capacité partielle

L'API publique documente `GET /posts` sur une plage de dates, mais pas `GET /posts/{id}`. La réponse
de liste ne garantit pas de champ d'état ou d'erreur. Aucun webhook sortant corrélé au `postId`
n'est documenté.

`getPostStatus` fournit donc uniquement des inférences explicites :

- `releaseURL` présent : `PUBLISHED`, certitude `INFERRED` ;
- date de publication future : `SCHEDULED`, certitude `INFERRED` ;
- autrement : `UNKNOWN_REMOTE_STATE`.

`supportsAuthoritativeRemoteStatus` vaut toujours `false` dans le provider réel. Les notifications
Postiz sont exposées pour diagnostic, mais leur texte libre n'est pas utilisé pour changer
automatiquement le statut d'une publication.

## Analytics

Les deux endpoints utilisent un nombre de jours `7`, `30` ou `90` :

- `GET /analytics/{integrationId}?date=30` ;
- `GET /analytics/post/{postId}?date=30`.

Le premier paramètre est l'ID de l'intégration, pas son identifiant `facebook` ou `instagram`. Les
métriques varient selon la plateforme. Le provider conserve les libellés et normalise `total` en
chaîne, conformément aux exemples officiels. Une réponse vide est valide.

## Gestion des erreurs et secrets

`PostizProviderError` distingue notamment authentification, validation, rate limit, indisponibilité
réseau, payload trop volumineux et contrat de réponse invalide. Il expose :

- l'opération ;
- le statut HTTP lorsqu'il existe ;
- le caractère retentable pour les lectures ;
- `Retry-After` converti en millisecondes ;
- l'indicateur `remoteStateMayHaveChanged`.

Les clés portant des noms tels que `authorization`, `apiKey`, `token`, `secret`, `password` ou
`cookie` sont expurgées. Les tokens `pos_...`, les valeurs Bearer et la clé connue sont également
masqués dans les chaînes. Ne jamais journaliser directement `Request`, `Headers`, `FormData` ou les
options du constructeur.

Les détails techniques assainis sont destinés aux logs serveur et à l'audit. L'interface utilisateur
doit afficher un message générique accompagné d'un identifiant de tentative.

## Provider de démonstration

`MockPostizProvider` fournit deux comptes explicitement marqués `DÉMO`, des uploads et IDs
séquentiels, des statistiques fixes et quatre scénarios déterministes :

- `success` : programmation puis publication lorsque l'horloge dépasse la date ;
- `submission_error` : erreur connue avant création distante ;
- `ambiguous` : le post peut exister mais la réponse ne permet pas de le confirmer ;
- `publication_error` : programmation confirmée puis échec simulé à l'heure de publication.

Une fonction `now` injectable permet aux tests de faire avancer le temps sans attente réelle.
Aucune donnée du mock ne doit être présentée comme provenant de yokosushi.fr ou de Postiz.

## Tests contractuels

Les tests couvrent :

- l'absence de préfixe Bearer ;
- le multipart et sa boundary automatique ;
- la forme du payload Facebook/Instagram ;
- la réponse tableau de création ;
- l'état ambigu sans retry ;
- l'annulation par passage à `draft`, jamais par suppression ;
- les inférences de statut clairement signalées ;
- les scénarios succès, erreur, ambiguïté et échec différé du mock ;
- les analytics et leur normalisation ;
- l'expurgation des secrets.

Avant d'activer `POSTIZ_MODE=real`, exécuter les tests contre une organisation Postiz jetable et
revalider l'OpenAPI. Une publication de test réelle doit toujours rester soumise à validation
humaine.
