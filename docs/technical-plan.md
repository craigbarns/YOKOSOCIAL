# Plan technique du MVP

## Décisions structurantes

- Monorepo npm workspaces piloté par Turborepo.
- `apps/web` : Next.js App Router, React, Tailwind CSS et API courtes déployées sur Railway.
- `apps/worker` : processus Node long-lived pour crawling, médias, IA, synchronisation et publication.
- Supabase fournit PostgreSQL managé. Prisma reste l’unique couche d’accès applicative.
- Better Auth fournit les comptes et sessions ; l’autorisation par organisation reste dans le domaine.
- Redis/BullMQ transporte les tâches longues. Le mode démo utilise des traitements déterministes locaux.
- Les intégrations sont derrière des interfaces : crawler, génération, stockage, publication et analytics.
- Postiz ne reçoit que des publications approuvées. Aucun couplage à son code source.

## Parcours vertical livré

1. Créer un compte ou démarrer la démonstration.
2. Créer l’organisation YokoSushi.
3. Lancer un import simulé ou un crawl HTTP réel autorisé.
4. Vérifier établissements, produits, informations critiques et médias.
5. Confirmer l’import dans la médiathèque.
6. Générer cinq propositions structurées.
7. Modifier, prévisualiser et approuver une proposition.
8. Choisir les plateformes, l’établissement et une date.
9. Programmer via `MockPostizProvider`.
10. Observer un statut programmé, publié ou en erreur simulée.

## Ordre d’implémentation

- Fondations et schéma de données.
- Authentification et isolation multi-tenant.
- Import sécurisé et fixtures de démonstration.
- Médiathèque et catalogue.
- Génération structurée et sélection de médias.
- Validation, calendrier et provider Postiz mock.
- Tests unitaires, intégration et E2E.
- Préparation GitHub, puis Railway.

## Risques principaux et traitements

| Risque                             | Traitement prévu                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| SSRF et exploration hors périmètre | Validation DNS/IP avant chaque requête et après chaque redirection, liste blanche stricte |
| Mélange entre établissements       | `organizationId` obligatoire, relations explicites et filtres de repository               |
| Donnée locale inventée             | Provenance, confiance, validation et avertissements obligatoires                          |
| Publication involontaire           | Garde métier `APPROVED`, idempotence et provider mock par défaut                          |
| Requêtes web trop longues          | Crawl et Playwright exclusivement dans le worker séparé                                   |
| Connexions Supabase                | URL poolée au runtime, URL directe pour Prisma Migrate                                    |
| Médias dupliqués                   | SHA-256 exact, hash perceptuel, jamais de suppression automatique                         |
| Réponse Postiz incertaine          | Vérification distante avant nouvelle tentative                                            |
| Mode hors ligne trompeur           | Fixtures marquées `DEMO`, aucune donnée présentée comme issue du site                     |

## Hypothèses documentées

- Supabase est la cible PostgreSQL managée ; le Docker Compose reste utile pour le développement local.
- Better Auth est préféré à Supabase Auth afin de conserver la portabilité du produit.
- Le stockage local est limité au mode démo ; un provider S3 est prévu pour production.
- Le MVP crée des scripts de Reels, pas de vidéo générée.
- Le provider Postiz réel expose seulement les capacités confirmées par la documentation officielle.
