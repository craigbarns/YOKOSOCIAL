# Architecture

## Vue d’ensemble

```text
Navigateur
  │
  ▼
apps/web (Next.js sur Railway)
  ├── authentification Better Auth
  ├── API courtes et autorisation tenant
  ├── onboarding, import, médiathèque, studio, calendrier
  └── création de jobs avec identifiants uniquement
              │
              ▼
        Redis / BullMQ
              │
              ▼
apps/worker (conteneur long-lived + Playwright)
  ├── website-importer ──► yokosushi.fr uniquement
  ├── media ─────────────► stockage S3 compatible
  ├── ai ────────────────► mock ou OpenAI
  └── postiz ────────────► mock ou API publique Postiz
              │
              ▼
     Supabase PostgreSQL via Prisma
```

`apps/web` ne lance ni crawl complet, ni Playwright, ni analyse d’image longue. Ces tâches appartiennent
au worker afin de ne pas bloquer le processus web avec un traitement long.

## Dépendances

Les contrats métier sont dans `packages/shared`. Les packages provider n’importent pas le schéma Prisma :
les applications composent providers et repositories.

- `database` : schéma Prisma, client singleton, seed et filtres tenant.
- `website-importer` : crawler HTTP/JSON réel et provider mock.
- `media` : contrôle MIME, hashes, scoring et stockage local/S3.
- `ai` : service de grounding, mock et provider OpenAI.
- `postiz` : interface indépendante, mock complet et client réel validé avec Zod.
- `config` : validation des variables et expurgation des secrets.
- `ui` : primitives inspirées de shadcn/ui.

## Multi-tenant

`User` est global. `OrganizationMember` relie un utilisateur à une ou plusieurs organisations avec un
rôle. Toute entité métier porte directement `organizationId`. Les mutations vérifient la session,
l’appartenance et le rôle, puis filtrent les requêtes Prisma par organisation.

Les médias identiques ne sont dédupliqués que dans une même organisation. Les clés objet sont préfixées
par `organizationId`.

## Import

```text
PENDING → CRAWLING → ANALYZING → WAITING_FOR_REVIEW
                                      │
                                      ▼
                                IMPORTING → COMPLETED
                                      └──► PARTIALLY_COMPLETED
```

Les données extraites restent dans une zone de staging avec source, date, confiance et statut. Les
valeurs critiques ne deviennent canoniques qu’après confirmation.

## Publication

```text
DRAFT → PENDING_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED
             └────────────► REJECTED       └───────────────► FAILED
```

Seule la version courante explicitement approuvée est programmable. Une modification après approbation
ramène la publication à `DRAFT`. Une réponse Postiz ambiguë devient `UNKNOWN_REMOTE_STATE` et interdit
la nouvelle tentative automatique.
