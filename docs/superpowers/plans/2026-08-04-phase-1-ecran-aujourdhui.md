# Phase 1 — Écran « Aujourd'hui » : plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** remplacer le tableau de bord par un écran qui ne pose qu'une question à la fois, calculée
depuis l'état réel du compte par une fonction pure et servie par un appel unique `GET /api/today`.

**Architecture :** un résolveur pur dans `packages/shared` traduit un instantané du compte en une action
typée. Deux constructeurs d'instantané l'alimentent — l'un depuis Prisma (mode réel), l'autre depuis
l'état de démonstration — de sorte que le même résolveur et le même écran servent les deux modes. L'écran
n'est qu'un rendu de l'action reçue.

**Stack :** TypeScript, Next.js 16 (App Router, `runtime = "nodejs"`), React 19, Prisma, Zod 4, Vitest,
Playwright, Tailwind 4, `@yokosocial/ui`.

**Spec de référence :** `docs/superpowers/specs/2026-08-04-refonte-experience-client-design.md`

## Contraintes globales

- Node `^20.19.0 || ^22.12.0 || >=24.0.0 <25`, npm `10.8.2`. Ne jamais ajouter de dépendance : tout ce
  plan s'écrit avec l'existant.
- Toute route API commence par `export const runtime = "nodejs";`.
- Toute route API valide ses paramètres avec Zod, appelle `requireOrganization(...)` et enveloppe le
  corps dans `try/catch` avec `accessErrorResponse(error)`.
- Toute lecture est filtrée par `organizationId` issu de l'autorisation, jamais par celui reçu du client.
- Textes d'interface en français, avec apostrophes typographiques (`’`), comme le reste du dépôt.
- Aucun message technique montré au client : tout échec devient une phrase actionnable + un bouton.
- Aucun fichier de composant au-dessus d'environ 250 lignes.
- Les imports internes de `packages/*` se terminent par `.js` (`export * from "./next-action.js"`).
- `npm run check` (lint + typecheck + tests) doit passer avant chaque commit.
- Phase 1 n'enlève rien : `/dashboard` et les neuf entrées de menu restent servis. La bascule et les
  suppressions arrivent en phase 2 et 3.

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `packages/shared/src/next-action.ts` | types `TodaySnapshot` / `NextAction` + résolveur pur |
| `packages/shared/src/next-action.test.ts` | un test par branche du résolveur |
| `packages/shared/src/index.ts` | ré-export |
| `apps/web/lib/today-contract.ts` | schéma Zod de la requête + type de réponse |
| `apps/web/lib/today-snapshot.ts` | comptages Prisma bruts → `TodaySnapshot` |
| `apps/web/lib/today-snapshot.test.ts` | tests du mapping |
| `apps/web/lib/today-snapshot-demo.ts` | `DemoState` → `TodaySnapshot` |
| `apps/web/lib/today-snapshot-demo.test.ts` | tests du mapping démo |
| `apps/web/app/api/today/route.ts` | requêtes Prisma + assemblage + réponse |
| `apps/web/lib/api/today.ts` | appel client typé + messages d'erreur lisibles |
| `apps/web/lib/api/today.test.ts` | tests des messages d'erreur |
| `apps/web/components/today/action-card.tsx` | rendu de chaque variante de `NextAction` |
| `apps/web/components/today/week-strip.tsx` | bande des publications à venir + deux chiffres |
| `apps/web/components/today/today-page.tsx` | chargement, sondage, assemblage |
| `apps/web/app/(product)/today/page.tsx` | route, aiguillage réel / démo |
| `apps/web/components/layout/app-shell.tsx` | ajout de l'entrée « Aujourd'hui » |
| `tests/e2e/today.spec.ts` | parcours navigateur en mode démo |

---

### Tâche 1 : le résolveur d'action

**Fichiers :**

- Créer : `packages/shared/src/next-action.ts`
- Créer : `packages/shared/src/next-action.test.ts`
- Modifier : `packages/shared/src/index.ts`

**Interfaces :**

- Consomme : rien.
- Produit : `TodaySnapshot`, `NextAction`, `UpcomingPost`, `ImportSnapshotStatus`,
  `resolveNextAction(snapshot: TodaySnapshot): NextAction`. Toutes les tâches suivantes en dépendent.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `packages/shared/src/next-action.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import { resolveNextAction, type TodaySnapshot } from "./next-action.js";

function snapshot(overrides: Partial<TodaySnapshot> = {}): TodaySnapshot {
  return {
    brandName: "Chez Marta",
    websiteUrl: "https://chez-marta.fr",
    import: { status: "COMPLETED", pagesScanned: 12, productsDetected: 42, imagesDetected: 64 },
    catalog: { pendingProducts: 0, pendingMedia: 0, validatedProducts: 42, validatedMedia: 64 },
    posts: { pendingReview: 0, approved: 0, scheduled: 0, failed: 0 },
    upcoming: [],
    connectedSocialAccounts: 1,
    appliedCorrections: 0,
    ...overrides
  };
}

describe("resolveNextAction", () => {
  it("demande le site quand aucun import n’existe", () => {
    const action = resolveNextAction(
      snapshot({
        import: { status: "NONE", pagesScanned: 0, productsDetected: 0, imagesDetected: 0 },
        websiteUrl: "https://chez-marta.fr"
      })
    );
    expect(action).toEqual({ kind: "IMPORT_WEBSITE", websiteUrl: "https://chez-marta.fr" });
  });

  it("montre la progression pendant l’import", () => {
    const action = resolveNextAction(
      snapshot({
        import: { status: "RUNNING", pagesScanned: 12, productsDetected: 28, imagesDetected: 64 }
      })
    );
    expect(action).toEqual({
      kind: "IMPORT_RUNNING",
      pagesScanned: 12,
      productsDetected: 28,
      imagesDetected: 64
    });
  });

  it("signale un import en échec avant toute autre chose", () => {
    const action = resolveNextAction(
      snapshot({
        import: { status: "FAILED", pagesScanned: 3, productsDetected: 0, imagesDetected: 0 },
        posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 2 }
      })
    );
    expect(action).toEqual({ kind: "IMPORT_FAILED" });
  });

  it("traite les publications en erreur avant le catalogue", () => {
    const action = resolveNextAction(
      snapshot({
        catalog: { pendingProducts: 42, pendingMedia: 64, validatedProducts: 0, validatedMedia: 0 },
        posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 2 }
      })
    );
    expect(action).toEqual({ kind: "FIX_FAILED_POSTS", count: 2 });
  });

  it("demande la validation du catalogue avant celle des publications", () => {
    const action = resolveNextAction(
      snapshot({
        catalog: { pendingProducts: 42, pendingMedia: 64, validatedProducts: 0, validatedMedia: 0 },
        posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 0 }
      })
    );
    expect(action).toEqual({ kind: "REVIEW_CATALOG", products: 42, media: 64 });
  });

  it("propose la validation hebdomadaire avec une durée estimée", () => {
    const action = resolveNextAction(
      snapshot({ posts: { pendingReview: 5, approved: 0, scheduled: 0, failed: 0 } })
    );
    expect(action).toEqual({ kind: "REVIEW_POSTS", count: 5, estimatedMinutes: 3 });
  });

  it("estime au moins une minute pour une seule publication", () => {
    const action = resolveNextAction(
      snapshot({ posts: { pendingReview: 1, approved: 0, scheduled: 0, failed: 0 } })
    );
    expect(action).toEqual({ kind: "REVIEW_POSTS", count: 1, estimatedMinutes: 1 });
  });

  it("demande la connexion d’un compte social quand il n’en existe aucun", () => {
    const action = resolveNextAction(snapshot({ connectedSocialAccounts: 0 }));
    expect(action).toEqual({ kind: "CONNECT_SOCIAL" });
  });

  it("annonce la prochaine publication quand tout est en ordre", () => {
    const action = resolveNextAction(
      snapshot({
        posts: { pendingReview: 0, approved: 0, scheduled: 2, failed: 0 },
        upcoming: [
          { id: "post-1", title: "Le plateau du vendredi", scheduledAt: "2026-08-11T10:00:00.000Z" },
          { id: "post-2", title: "Nos makis", scheduledAt: "2026-08-13T10:00:00.000Z" }
        ]
      })
    );
    expect(action).toEqual({
      kind: "ALL_CLEAR",
      nextScheduledAt: "2026-08-11T10:00:00.000Z"
    });
  });

  it("reste en ordre sans aucune publication programmée", () => {
    const action = resolveNextAction(snapshot());
    expect(action).toEqual({ kind: "ALL_CLEAR", nextScheduledAt: null });
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu’ils échouent**

```bash
npm run test --workspace @yokosocial/shared
```

Attendu : ÉCHEC — `Failed to resolve import "./next-action.js"`.

- [ ] **Étape 3 : écrire le résolveur**

Créer `packages/shared/src/next-action.ts` :

```ts
export type ImportSnapshotStatus = "NONE" | "RUNNING" | "NEEDS_REVIEW" | "COMPLETED" | "FAILED";

export type UpcomingPost = {
  id: string;
  title: string;
  scheduledAt: string;
};

export type TodaySnapshot = {
  brandName: string;
  websiteUrl: string | null;
  import: {
    status: ImportSnapshotStatus;
    pagesScanned: number;
    productsDetected: number;
    imagesDetected: number;
  };
  catalog: {
    pendingProducts: number;
    pendingMedia: number;
    validatedProducts: number;
    validatedMedia: number;
  };
  posts: {
    pendingReview: number;
    approved: number;
    scheduled: number;
    failed: number;
  };
  upcoming: UpcomingPost[];
  connectedSocialAccounts: number;
  appliedCorrections: number;
};

export type NextAction =
  | { kind: "IMPORT_WEBSITE"; websiteUrl: string | null }
  | {
      kind: "IMPORT_RUNNING";
      pagesScanned: number;
      productsDetected: number;
      imagesDetected: number;
    }
  | { kind: "IMPORT_FAILED" }
  | { kind: "FIX_FAILED_POSTS"; count: number }
  | { kind: "REVIEW_CATALOG"; products: number; media: number }
  | { kind: "REVIEW_POSTS"; count: number; estimatedMinutes: number }
  | { kind: "CONNECT_SOCIAL" }
  | { kind: "ALL_CLEAR"; nextScheduledAt: string | null };

/** Environ 36 secondes par publication, jamais moins d’une minute annoncée. */
function estimateMinutes(count: number): number {
  return Math.max(1, Math.round(count * 0.6));
}

/**
 * Traduit l’état du compte en la seule chose à faire maintenant.
 * L’ordre des tests EST la règle produit : ce qui bloque la publication passe avant
 * ce qui l’améliore.
 */
export function resolveNextAction(snapshot: TodaySnapshot): NextAction {
  if (snapshot.import.status === "FAILED") {
    return { kind: "IMPORT_FAILED" };
  }
  if (snapshot.import.status === "NONE") {
    return { kind: "IMPORT_WEBSITE", websiteUrl: snapshot.websiteUrl };
  }
  if (snapshot.import.status === "RUNNING") {
    return {
      kind: "IMPORT_RUNNING",
      pagesScanned: snapshot.import.pagesScanned,
      productsDetected: snapshot.import.productsDetected,
      imagesDetected: snapshot.import.imagesDetected
    };
  }
  if (snapshot.posts.failed > 0) {
    return { kind: "FIX_FAILED_POSTS", count: snapshot.posts.failed };
  }
  if (snapshot.catalog.pendingProducts > 0 || snapshot.catalog.pendingMedia > 0) {
    return {
      kind: "REVIEW_CATALOG",
      products: snapshot.catalog.pendingProducts,
      media: snapshot.catalog.pendingMedia
    };
  }
  if (snapshot.posts.pendingReview > 0) {
    return {
      kind: "REVIEW_POSTS",
      count: snapshot.posts.pendingReview,
      estimatedMinutes: estimateMinutes(snapshot.posts.pendingReview)
    };
  }
  if (snapshot.connectedSocialAccounts === 0) {
    return { kind: "CONNECT_SOCIAL" };
  }
  return { kind: "ALL_CLEAR", nextScheduledAt: snapshot.upcoming[0]?.scheduledAt ?? null };
}
```

- [ ] **Étape 4 : ré-exporter depuis l’index**

Modifier `packages/shared/src/index.ts` — ajouter la ligne en respectant l’ordre alphabétique :

```ts
export * from "./demo.js";
export * from "./jobs.js";
export * from "./next-action.js";
export * from "./schemas.js";
export * from "./workflow.js";
```

- [ ] **Étape 5 : lancer les tests et vérifier qu’ils passent**

```bash
npm run test --workspace @yokosocial/shared
```

Attendu : SUCCÈS, 10 tests passés dans `next-action.test.ts`.

- [ ] **Étape 6 : commit**

```bash
git add packages/shared/src/next-action.ts packages/shared/src/next-action.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): résolveur d'action pour l'écran Aujourd'hui"
```

---

### Tâche 2 : l’instantané depuis Prisma

**Fichiers :**

- Créer : `apps/web/lib/today-snapshot.ts`
- Créer : `apps/web/lib/today-snapshot.test.ts`

**Interfaces :**

- Consomme : `TodaySnapshot` de `@yokosocial/shared` (tâche 1).
- Produit : `TodayCounts`, `buildTodaySnapshot(counts: TodayCounts): TodaySnapshot`. La tâche 3 remplit
  `TodayCounts` depuis Prisma.

Cette tâche isole la seule partie testable sans base de données : la traduction des comptages bruts en
instantané. La route de la tâche 3 ne fera plus que des requêtes.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `apps/web/lib/today-snapshot.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import { buildTodaySnapshot, type TodayCounts } from "./today-snapshot";

function counts(overrides: Partial<TodayCounts> = {}): TodayCounts {
  return {
    brandName: "Chez Marta",
    websiteUrl: "https://chez-marta.fr",
    latestImport: {
      status: "COMPLETED",
      pagesScanned: 12,
      productsDetected: 42,
      imagesDetected: 64
    },
    pendingProducts: 0,
    validatedProducts: 42,
    pendingMedia: 0,
    validatedMedia: 64,
    postsByStatus: {},
    upcoming: [],
    connectedSocialAccounts: 1,
    appliedCorrections: 0,
    ...overrides
  };
}

describe("buildTodaySnapshot", () => {
  it("traduit l’absence d’import en statut NONE", () => {
    const snapshot = buildTodaySnapshot(counts({ latestImport: null }));
    expect(snapshot.import).toEqual({
      status: "NONE",
      pagesScanned: 0,
      productsDetected: 0,
      imagesDetected: 0
    });
  });

  it.each([
    ["PENDING", "RUNNING"],
    ["CRAWLING", "RUNNING"],
    ["ANALYZING", "RUNNING"],
    ["IMPORTING", "RUNNING"],
    ["WAITING_FOR_REVIEW", "NEEDS_REVIEW"],
    ["COMPLETED", "COMPLETED"],
    ["PARTIALLY_COMPLETED", "COMPLETED"],
    ["FAILED", "FAILED"],
    ["CANCELLED", "FAILED"]
  ])("traduit le statut d’import %s en %s", (prismaStatus, expected) => {
    const snapshot = buildTodaySnapshot(
      counts({
        latestImport: {
          status: prismaStatus,
          pagesScanned: 5,
          productsDetected: 10,
          imagesDetected: 20
        }
      })
    );
    expect(snapshot.import.status).toBe(expected);
  });

  it("compte les publications par statut, zéro par défaut", () => {
    const snapshot = buildTodaySnapshot(
      counts({ postsByStatus: { PENDING_REVIEW: 5, SCHEDULED: 2 } })
    );
    expect(snapshot.posts).toEqual({
      pendingReview: 5,
      approved: 0,
      scheduled: 2,
      failed: 0
    });
  });

  it("convertit les dates de programmation en chaînes ISO", () => {
    const snapshot = buildTodaySnapshot(
      counts({
        upcoming: [
          {
            id: "post-1",
            title: "Le plateau du vendredi",
            scheduledAt: new Date("2026-08-11T10:00:00.000Z")
          }
        ]
      })
    );
    expect(snapshot.upcoming).toEqual([
      { id: "post-1", title: "Le plateau du vendredi", scheduledAt: "2026-08-11T10:00:00.000Z" }
    ]);
  });

  it("reporte le catalogue et la marque sans transformation", () => {
    const snapshot = buildTodaySnapshot(
      counts({ pendingProducts: 42, pendingMedia: 64, validatedProducts: 0, validatedMedia: 0 })
    );
    expect(snapshot.brandName).toBe("Chez Marta");
    expect(snapshot.catalog).toEqual({
      pendingProducts: 42,
      pendingMedia: 64,
      validatedProducts: 0,
      validatedMedia: 0
    });
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu’ils échouent**

```bash
npm run test --workspace @yokosocial/web
```

Attendu : ÉCHEC — `Failed to resolve import "./today-snapshot"`.

- [ ] **Étape 3 : écrire le constructeur**

Créer `apps/web/lib/today-snapshot.ts` :

```ts
import type { ImportSnapshotStatus, TodaySnapshot } from "@yokosocial/shared";

export type TodayCounts = {
  brandName: string;
  websiteUrl: string | null;
  latestImport: {
    status: string;
    pagesScanned: number;
    productsDetected: number;
    imagesDetected: number;
  } | null;
  pendingProducts: number;
  validatedProducts: number;
  pendingMedia: number;
  validatedMedia: number;
  postsByStatus: Record<string, number>;
  upcoming: Array<{ id: string; title: string; scheduledAt: Date }>;
  connectedSocialAccounts: number;
  appliedCorrections: number;
};

const IMPORT_STATUS_MAP: Record<string, ImportSnapshotStatus> = {
  PENDING: "RUNNING",
  CRAWLING: "RUNNING",
  ANALYZING: "RUNNING",
  IMPORTING: "RUNNING",
  WAITING_FOR_REVIEW: "NEEDS_REVIEW",
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "FAILED"
};

export function buildTodaySnapshot(counts: TodayCounts): TodaySnapshot {
  const latest = counts.latestImport;
  return {
    brandName: counts.brandName,
    websiteUrl: counts.websiteUrl,
    import: {
      status: latest ? (IMPORT_STATUS_MAP[latest.status] ?? "COMPLETED") : "NONE",
      pagesScanned: latest?.pagesScanned ?? 0,
      productsDetected: latest?.productsDetected ?? 0,
      imagesDetected: latest?.imagesDetected ?? 0
    },
    catalog: {
      pendingProducts: counts.pendingProducts,
      pendingMedia: counts.pendingMedia,
      validatedProducts: counts.validatedProducts,
      validatedMedia: counts.validatedMedia
    },
    posts: {
      pendingReview: counts.postsByStatus.PENDING_REVIEW ?? 0,
      approved: counts.postsByStatus.APPROVED ?? 0,
      scheduled: counts.postsByStatus.SCHEDULED ?? 0,
      failed: counts.postsByStatus.FAILED ?? 0
    },
    upcoming: counts.upcoming.map((post) => ({
      id: post.id,
      title: post.title,
      scheduledAt: post.scheduledAt.toISOString()
    })),
    connectedSocialAccounts: counts.connectedSocialAccounts,
    appliedCorrections: counts.appliedCorrections
  };
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu’ils passent**

```bash
npm run test --workspace @yokosocial/web
```

Attendu : SUCCÈS, 13 tests passés dans `today-snapshot.test.ts`.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/lib/today-snapshot.ts apps/web/lib/today-snapshot.test.ts
git commit -m "feat(web): construction de l'instantané Aujourd'hui depuis les comptages"
```

---

### Tâche 3 : la route `GET /api/today`

**Fichiers :**

- Créer : `apps/web/lib/today-contract.ts`
- Créer : `apps/web/app/api/today/route.ts`

**Interfaces :**

- Consomme : `buildTodaySnapshot`, `TodayCounts` (tâche 2) ; `resolveNextAction`, `TodaySnapshot`,
  `NextAction` (tâche 1) ; `requireOrganization` de `@/lib/authorization` ; `accessErrorResponse` de
  `@/lib/api-access`.
- Produit : `todayQuerySchema`, `type TodayResponse = { snapshot: TodaySnapshot; action: NextAction }`.
  La tâche 5 consomme `TodayResponse`.

Cette route remplace les quatre requêtes parallèles du tableau de bord actuel
(`real-dashboard-page.tsx`, `Promise.allSettled` sur `/api/posts`, `/api/media`, `/api/products`,
`/api/imports`) par un seul appel — ce qui supprime les états d’échec partiel montrés au client.

- [ ] **Étape 1 : écrire le contrat**

Créer `apps/web/lib/today-contract.ts` :

```ts
import type { NextAction, TodaySnapshot } from "@yokosocial/shared";
import { z } from "zod";

export const todayQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  brandId: z.string().trim().min(1)
});

export type TodayQuery = z.infer<typeof todayQuerySchema>;

export type TodayResponse = {
  snapshot: TodaySnapshot;
  action: NextAction;
};
```

- [ ] **Étape 2 : écrire la route**

Créer `apps/web/app/api/today/route.ts` :

```ts
import { db } from "@yokosocial/database";
import { resolveNextAction } from "@yokosocial/shared";
import { NextResponse } from "next/server";

import { accessErrorResponse } from "@/lib/api-access";
import { requireOrganization } from "@/lib/authorization";
import { todayQuerySchema } from "@/lib/today-contract";
import { buildTodaySnapshot } from "@/lib/today-snapshot";

export const runtime = "nodejs";

const UPCOMING_LIMIT = 3;

export async function GET(request: Request) {
  const query = todayQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!query.success) {
    return NextResponse.json({ error: "Paramètres de recherche invalides." }, { status: 400 });
  }

  try {
    const authorization = await requireOrganization(
      query.data.organizationId,
      undefined,
      request.headers
    );
    const scope = { organizationId: authorization.organizationId, brandId: query.data.brandId };

    const brand = await db.restaurantBrand.findFirst({
      where: { id: query.data.brandId, organizationId: authorization.organizationId },
      select: { id: true, name: true, websiteUrl: true }
    });
    if (!brand) return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });

    const [
      latestImport,
      pendingProducts,
      validatedProducts,
      pendingMedia,
      validatedMedia,
      postGroups,
      upcoming,
      connectedSocialAccounts,
      appliedCorrections
    ] = await Promise.all([
      db.websiteImport.findFirst({
        where: scope,
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          pagesScanned: true,
          productsDetected: true,
          imagesDetected: true
        }
      }),
      db.menuItem.count({ where: { ...scope, validationStatus: "UNREVIEWED" } }),
      db.menuItem.count({ where: { ...scope, validationStatus: "APPROVED" } }),
      db.mediaAsset.count({ where: { ...scope, status: "NEEDS_REVIEW" } }),
      db.mediaAsset.count({ where: { ...scope, status: "APPROVED" } }),
      db.socialPost.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      db.socialPost.findMany({
        where: { ...scope, status: { in: ["SCHEDULED", "PUBLISHING"] }, scheduledAt: { not: null } },
        orderBy: { scheduledAt: "asc" },
        take: UPCOMING_LIMIT,
        select: { id: true, title: true, scheduledAt: true }
      }),
      db.socialAccount.count({ where: { ...scope, status: "CONNECTED" } }),
      db.userFeedback.count({
        where: { organizationId: authorization.organizationId, target: "SOCIAL_POST" }
      })
    ]);

    const postsByStatus: Record<string, number> = {};
    for (const group of postGroups) {
      postsByStatus[group.status] = group._count._all;
    }

    const snapshot = buildTodaySnapshot({
      brandName: brand.name,
      websiteUrl: brand.websiteUrl,
      latestImport,
      pendingProducts,
      validatedProducts,
      pendingMedia,
      validatedMedia,
      postsByStatus,
      upcoming: upcoming.flatMap((post) =>
        post.scheduledAt
          ? [{ id: post.id, title: post.title, scheduledAt: post.scheduledAt }]
          : []
      ),
      connectedSocialAccounts,
      appliedCorrections
    });

    return NextResponse.json({ snapshot, action: resolveNextAction(snapshot) });
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
```

- [ ] **Étape 3 : vérifier la compilation et le lint**

```bash
npm run typecheck --workspace @yokosocial/web && npm run lint --workspace @yokosocial/web
```

Attendu : SUCCÈS. Les champs `pagesScanned`, `productsDetected` et `imagesDetected` existent bien sur
`WebsiteImport`, et `MenuItem.validationStatus` comme `MediaAsset.status` sont ceux du schéma —
vérifié contre `packages/database/prisma/schema.prisma`.

- [ ] **Étape 4 : vérifier la route à la main**

```bash
npm run dev:web
```

Ouvrir `http://localhost:3000/api/today?organizationId=x&brandId=y` sans session.
Attendu : `401` avec un corps JSON, jamais une trace d’erreur.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/lib/today-contract.ts apps/web/app/api/today/route.ts
git commit -m "feat(web): route GET /api/today en un seul appel"
```

---

### Tâche 4 : l’instantané depuis l’état de démonstration

**Fichiers :**

- Créer : `apps/web/lib/today-snapshot-demo.ts`
- Créer : `apps/web/lib/today-snapshot-demo.test.ts`

**Interfaces :**

- Consomme : `DemoState` de `@/lib/demo-state` ; `TodaySnapshot` de `@yokosocial/shared`.
- Produit : `buildDemoTodaySnapshot(state: DemoState): TodaySnapshot`. La tâche 7 l’utilise pour servir
  le même écran en mode démo.

Sans cette tâche, le parcours Playwright ne peut pas couvrir l’écran : la configuration
`playwright.config.ts` force `DEMO_MODE=true` et il n’y a pas de base de données en e2e.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `apps/web/lib/today-snapshot-demo.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import { emptyDemoState, type DemoState } from "./demo-state";
import { buildDemoTodaySnapshot } from "./today-snapshot-demo";

function demoState(overrides: Partial<DemoState> = {}): DemoState {
  return { ...emptyDemoState, hydrated: true, ...overrides };
}

const summary = {
  pagesScanned: 12,
  establishmentsDetected: 2,
  productsDetected: 42,
  categoriesDetected: 6,
  imagesDetected: 80,
  imagesRetained: 64,
  duplicatesDetected: 4,
  smallImages: 12,
  errorsCount: 0,
  validationRequired: 3,
  demo: true as const
};

describe("buildDemoTodaySnapshot", () => {
  it("part d’un import inexistant sur un état vierge", () => {
    const snapshot = buildDemoTodaySnapshot(demoState());
    expect(snapshot.import.status).toBe("NONE");
  });

  it("passe en RUNNING pendant l’analyse", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({ import: { ...emptyDemoState.import, running: true, step: "pages", progress: 40 } })
    );
    expect(snapshot.import.status).toBe("RUNNING");
  });

  it("demande la validation du catalogue tant que l’import n’est pas confirmé", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({ import: { ...emptyDemoState.import, summary, confirmed: false } })
    );
    expect(snapshot.import.status).toBe("NEEDS_REVIEW");
    expect(snapshot.catalog.pendingProducts).toBe(42);
    expect(snapshot.catalog.pendingMedia).toBe(64);
  });

  it("bascule le catalogue en validé après confirmation", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({ import: { ...emptyDemoState.import, summary, confirmed: true } })
    );
    expect(snapshot.import.status).toBe("COMPLETED");
    expect(snapshot.catalog).toEqual({
      pendingProducts: 0,
      pendingMedia: 0,
      validatedProducts: 42,
      validatedMedia: 64
    });
  });

  it("compte les publications de démonstration par statut", () => {
    const snapshot = buildDemoTodaySnapshot(
      demoState({
        import: { ...emptyDemoState.import, summary, confirmed: true },
        posts: [
          { id: "p1", status: "PENDING_REVIEW" },
          { id: "p2", status: "PENDING_REVIEW" },
          { id: "p3", status: "SCHEDULED", scheduledAt: "2026-08-11T10:00:00.000Z", title: "Makis" }
        ] as DemoState["posts"]
      })
    );
    expect(snapshot.posts.pendingReview).toBe(2);
    expect(snapshot.posts.scheduled).toBe(1);
    expect(snapshot.upcoming).toEqual([
      { id: "p3", title: "Makis", scheduledAt: "2026-08-11T10:00:00.000Z" }
    ]);
  });

  it("considère un compte social connecté en démonstration", () => {
    const snapshot = buildDemoTodaySnapshot(demoState());
    expect(snapshot.connectedSocialAccounts).toBe(1);
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu’ils échouent**

```bash
npm run test --workspace @yokosocial/web
```

Attendu : ÉCHEC — `Failed to resolve import "./today-snapshot-demo"`.

- [ ] **Étape 3 : écrire le constructeur démo**

Créer `apps/web/lib/today-snapshot-demo.ts` :

```ts
import type { ImportSnapshotStatus, TodaySnapshot, UpcomingPost } from "@yokosocial/shared";

import type { DemoState } from "./demo-state";

const UPCOMING_LIMIT = 3;

function importStatus(state: DemoState): ImportSnapshotStatus {
  if (state.import.running) return "RUNNING";
  if (!state.import.summary) return "NONE";
  return state.import.confirmed ? "COMPLETED" : "NEEDS_REVIEW";
}

function upcomingPosts(state: DemoState): UpcomingPost[] {
  return state.posts
    .flatMap((post) =>
      post.scheduledAt && (post.status === "SCHEDULED" || post.status === "PUBLISHING")
        ? [{ id: post.id, title: post.title, scheduledAt: post.scheduledAt }]
        : []
    )
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))
    .slice(0, UPCOMING_LIMIT);
}

export function buildDemoTodaySnapshot(state: DemoState): TodaySnapshot {
  const summary = state.import.summary;
  const confirmed = state.import.confirmed;
  const products = summary?.productsDetected ?? 0;
  const media = summary?.imagesRetained ?? 0;

  const countByStatus = (status: string) =>
    state.posts.filter((post) => post.status === status).length;

  return {
    brandName: state.organization?.name ?? "Votre restaurant",
    websiteUrl: state.organization?.websiteUrl ?? null,
    import: {
      status: importStatus(state),
      pagesScanned: summary?.pagesScanned ?? 0,
      productsDetected: products,
      imagesDetected: summary?.imagesDetected ?? 0
    },
    catalog: {
      pendingProducts: summary && !confirmed ? products : 0,
      pendingMedia: summary && !confirmed ? media : 0,
      validatedProducts: confirmed ? products : 0,
      validatedMedia: confirmed ? media : 0
    },
    posts: {
      pendingReview: countByStatus("PENDING_REVIEW"),
      approved: countByStatus("APPROVED"),
      scheduled: countByStatus("SCHEDULED"),
      failed: countByStatus("FAILED")
    },
    upcoming: upcomingPosts(state),
    connectedSocialAccounts: 1,
    appliedCorrections: 0
  };
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu’ils passent**

```bash
npm run test --workspace @yokosocial/web
```

Attendu : SUCCÈS, 6 tests passés dans `today-snapshot-demo.test.ts`. `DemoPost` étend `GeneratedPost`,
dont `title` est une chaîne obligatoire (`packages/shared/src/schemas.ts`) : aucun repli n’est
nécessaire.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/lib/today-snapshot-demo.ts apps/web/lib/today-snapshot-demo.test.ts
git commit -m "feat(web): instantané Aujourd'hui pour le mode démonstration"
```

---

### Tâche 5 : la couche d’appel client

**Fichiers :**

- Créer : `apps/web/lib/api/today.ts`
- Créer : `apps/web/lib/api/today.test.ts`

**Interfaces :**

- Consomme : `TodayResponse` de `@/lib/today-contract` (tâche 3).
- Produit : `fetchToday({ organizationId, brandId }): Promise<TodayResponse>` et
  `todayErrorMessage(status: number): string`. La tâche 7 les utilise.

C’est ici que la règle « aucun message technique » devient du code : le composant ne verra jamais un
code HTTP, seulement une phrase.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `apps/web/lib/api/today.test.ts` :

```ts
import { describe, expect, it } from "vitest";

import { todayErrorMessage } from "./today";

describe("todayErrorMessage", () => {
  it("invite à se reconnecter sur une session expirée", () => {
    expect(todayErrorMessage(401)).toBe("Votre session a expiré. Reconnectez-vous.");
  });

  it("explique un accès refusé sans jargon", () => {
    expect(todayErrorMessage(403)).toBe("Vous n’avez pas accès à cet espace.");
  });

  it("oriente vers la création de la marque sur un 404", () => {
    expect(todayErrorMessage(404)).toBe(
      "Votre espace n’est pas encore configuré. Reprenez la création de votre restaurant."
    );
  });

  it("annonce une indisponibilité temporaire sur un 503", () => {
    expect(todayErrorMessage(503)).toBe(
      "Service momentanément indisponible. Réessayez dans un instant."
    );
  });

  it("retombe sur une phrase actionnable pour tout autre code", () => {
    expect(todayErrorMessage(500)).toBe("Impossible de charger votre journée. Réessayez.");
  });
});
```

- [ ] **Étape 2 : lancer les tests et vérifier qu’ils échouent**

```bash
npm run test --workspace @yokosocial/web
```

Attendu : ÉCHEC — `Failed to resolve import "./today"`.

- [ ] **Étape 3 : écrire la couche d’appel**

Créer `apps/web/lib/api/today.ts` :

```ts
import type { TodayResponse } from "@/lib/today-contract";

export function todayErrorMessage(status: number): string {
  if (status === 401) return "Votre session a expiré. Reconnectez-vous.";
  if (status === 403) return "Vous n’avez pas accès à cet espace.";
  if (status === 404) {
    return "Votre espace n’est pas encore configuré. Reprenez la création de votre restaurant.";
  }
  if (status === 503) return "Service momentanément indisponible. Réessayez dans un instant.";
  return "Impossible de charger votre journée. Réessayez.";
}

export class TodayRequestError extends Error {
  constructor(readonly status: number) {
    super(todayErrorMessage(status));
    this.name = "TodayRequestError";
  }
}

export async function fetchToday(params: {
  organizationId: string;
  brandId: string;
}): Promise<TodayResponse> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/today?${query}`, {
    cache: "no-store",
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new TodayRequestError(response.status);
  return (await response.json()) as TodayResponse;
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu’ils passent**

```bash
npm run test --workspace @yokosocial/web
```

Attendu : SUCCÈS, 5 tests passés dans `today.test.ts`.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/lib/api/today.ts apps/web/lib/api/today.test.ts
git commit -m "feat(web): appel client de /api/today avec messages lisibles"
```

---

### Tâche 6 : la carte d’action

**Fichiers :**

- Créer : `apps/web/components/today/action-card.tsx`

**Interfaces :**

- Consomme : `NextAction` de `@yokosocial/shared` (tâche 1) ; `Button`, `Card`, `CardContent` de
  `@yokosocial/ui`.
- Produit : `<ActionCard action={action} />`. La tâche 7 la place dans la page.

Composant purement présentationnel : aucun `fetch`, aucun `useEffect`. Un `switch` exhaustif sur
`action.kind` — TypeScript signalera toute variante oubliée.

- [ ] **Étape 1 : écrire le composant**

Créer `apps/web/components/today/action-card.tsx` :

```tsx
"use client";

import type { NextAction } from "@yokosocial/shared";
import { Button, Card, CardContent } from "@yokosocial/ui";
import {
  ArrowRight,
  CalendarCheck,
  CircleAlert,
  Globe2,
  Instagram,
  LoaderCircle,
  PackageOpen,
  Sparkles
} from "lucide-react";
import Link from "next/link";

type Presentation = {
  eyebrow: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  icon: typeof Sparkles;
  tone: "rose" | "amber" | "emerald";
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

function present(action: NextAction): Presentation {
  switch (action.kind) {
    case "IMPORT_WEBSITE":
      return {
        eyebrow: "Première étape",
        title: "Collons votre site.",
        description:
          "Nous y récupérons vos plats et vos photos. Rien n’est publié : vous validez tout avant.",
        cta: { label: "Analyser mon site", href: "/import" },
        icon: Globe2,
        tone: "rose"
      };
    case "IMPORT_RUNNING":
      return {
        eyebrow: "En cours",
        title: "Nous lisons votre site.",
        description: `${action.pagesScanned} page(s) lue(s) · ${action.productsDetected} plat(s) trouvé(s) · ${action.imagesDetected} photo(s).`,
        icon: LoaderCircle,
        tone: "amber"
      };
    case "IMPORT_FAILED":
      return {
        eyebrow: "À reprendre",
        title: "Nous n’avons pas pu lire votre site.",
        description:
          "L’adresse est peut-être inaccessible depuis l’extérieur. Vérifiez-la et relancez l’analyse.",
        cta: { label: "Reprendre l’analyse", href: "/import" },
        icon: CircleAlert,
        tone: "amber"
      };
    case "FIX_FAILED_POSTS":
      return {
        eyebrow: "À corriger",
        title:
          action.count === 1
            ? "Une publication n’est pas partie."
            : `${action.count} publications ne sont pas parties.`,
        description: "Ouvrez-les pour voir ce qui bloque et relancer l’envoi.",
        cta: { label: "Voir les publications", href: "/posts" },
        icon: CircleAlert,
        tone: "amber"
      };
    case "REVIEW_CATALOG":
      return {
        eyebrow: "À valider",
        title: `${action.products} plats et ${action.media} photos vous attendent.`,
        description: "Un coup d’œil, un clic, et votre carte est en ligne dans l’application.",
        cta: { label: "Tout valider", href: "/products" },
        icon: PackageOpen,
        tone: "rose"
      };
    case "REVIEW_POSTS":
      return {
        eyebrow: "Votre rendez-vous",
        title:
          action.count === 1
            ? "Une publication vous attend."
            : `${action.count} publications vous attendent.`,
        description: `Environ ${action.estimatedMinutes} minute(s). Rien ne part sans votre accord.`,
        cta: { label: "Commencer", href: "/posts" },
        icon: Sparkles,
        tone: "rose"
      };
    case "CONNECT_SOCIAL":
      return {
        eyebrow: "Dernière étape",
        title: "Plus qu’une chose : connecter Instagram.",
        description: "Sans compte connecté, vos publications validées ne peuvent pas être programmées.",
        cta: { label: "Connecter un compte", href: "/social-accounts" },
        icon: Instagram,
        tone: "rose"
      };
    case "ALL_CLEAR":
      return {
        eyebrow: "Tout est en ordre",
        title: "Rien à faire aujourd’hui.",
        description: action.nextScheduledAt
          ? `Prochaine publication le ${formatDate(action.nextScheduledAt)}.`
          : "Aucune publication programmée pour le moment.",
        cta: { label: "Voir mon calendrier", href: "/calendar" },
        icon: CalendarCheck,
        tone: "emerald"
      };
  }
}

const TONES = {
  rose: "border-rose-100 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60",
  amber: "border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-white",
  emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white"
} as const;

export function ActionCard({ action }: { action: NextAction }) {
  const view = present(action);
  const Icon = view.icon;
  const spinning = action.kind === "IMPORT_RUNNING";

  return (
    <Card className={TONES[view.tone]}>
      <CardContent className="p-6 sm:p-10">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-rose-600 uppercase">
          <Icon className={spinning ? "size-4 animate-spin" : "size-4"} />
          {view.eyebrow}
        </p>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-balance text-slate-950 sm:text-4xl">
          {view.title}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">{view.description}</p>
        {view.cta && (
          <Button asChild className="mt-7" size="lg">
            <Link href={view.cta.href}>
              {view.cta.label} <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Étape 2 : vérifier la compilation et le lint**

```bash
npm run typecheck --workspace @yokosocial/web && npm run lint --workspace @yokosocial/web
```

Attendu : SUCCÈS. Si `Button` n’accepte pas `asChild` ou `size="lg"`, ouvrir
`packages/ui/src/button.tsx` et utiliser les props réellement exposées.

- [ ] **Étape 3 : commit**

```bash
git add apps/web/components/today/action-card.tsx
git commit -m "feat(web): carte d'action unique de l'écran Aujourd'hui"
```

---

### Tâche 7 : l’écran « Aujourd'hui »

**Fichiers :**

- Créer : `apps/web/components/today/week-strip.tsx`
- Créer : `apps/web/components/today/today-page.tsx`
- Créer : `apps/web/app/(product)/today/page.tsx`

**Interfaces :**

- Consomme : `ActionCard` (tâche 6) ; `fetchToday`, `TodayRequestError` (tâche 5) ;
  `buildDemoTodaySnapshot` (tâche 4) ; `resolveNextAction` (tâche 1) ; `useRealWorkspace` de
  `@/components/workspace/use-real-workspace` ; `useDemo` de `@/components/demo/demo-provider` ;
  `AppShell` de `@/components/layout/app-shell` ; `isPublicDemoMode` de `@/lib/demo-mode`.
- Produit : la route `/today`. La tâche 8 y renvoie depuis la navigation.

Le sondage n’a lieu que pendant un import : toutes les 8 secondes, comme le tableau de bord actuel, et
il s’arrête dès que l’action change.

- [ ] **Étape 1 : écrire la bande de semaine**

Créer `apps/web/components/today/week-strip.tsx` :

```tsx
"use client";

import type { TodaySnapshot } from "@yokosocial/shared";
import { Card, CardContent } from "@yokosocial/ui";
import { CalendarClock, Images, PackageOpen } from "lucide-react";
import Link from "next/link";

export function WeekStrip({ snapshot }: { snapshot: TodaySnapshot }) {
  return (
    <section className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Vos prochaines publications</h3>
          {snapshot.upcoming.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Aucune publication programmée pour le moment.
            </p>
          ) : (
            <ul className="space-y-3">
              {snapshot.upcoming.map((post) => (
                <li key={post.id}>
                  <Link
                    href="/calendar"
                    className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-white text-rose-500">
                      <CalendarClock className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {post.title}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {new Date(post.scheduledAt).toLocaleString("fr-FR", {
                          dateStyle: "medium",
                          timeStyle: "short"
                        })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-slate-900">Votre matière première</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <PackageOpen className="mb-2 size-4 text-rose-500" />
              <p className="text-2xl font-semibold text-slate-950">
                {snapshot.catalog.validatedProducts}
              </p>
              <p className="mt-1 text-xs text-slate-500">plats validés</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <Images className="mb-2 size-4 text-rose-500" />
              <p className="text-2xl font-semibold text-slate-950">
                {snapshot.catalog.validatedMedia}
              </p>
              <p className="mt-1 text-xs text-slate-500">photos validées</p>
            </div>
          </div>
          {snapshot.appliedCorrections > 0 && (
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Vos publications tiennent compte de vos {snapshot.appliedCorrections} dernières
              corrections.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
```

- [ ] **Étape 2 : écrire l’écran**

Créer `apps/web/components/today/today-page.tsx` :

```tsx
"use client";

import { resolveNextAction, type NextAction, type TodaySnapshot } from "@yokosocial/shared";
import { Button, Card, CardContent } from "@yokosocial/ui";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { ActionCard } from "@/components/today/action-card";
import { WeekStrip } from "@/components/today/week-strip";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import { fetchToday, TodayRequestError } from "@/lib/api/today";
import { buildDemoTodaySnapshot } from "@/lib/today-snapshot-demo";

const IMPORT_POLL_INTERVAL = 8_000;

function TodayLayout({
  brandName,
  snapshot,
  action,
  error,
  onRetry,
  busy
}: {
  brandName: string;
  snapshot?: TodaySnapshot;
  action?: NextAction;
  error?: string;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Aujourd’hui"
        title={`Bonjour, ${brandName}`}
        description="Une seule chose à la fois. Le reste attend son tour."
      />
      {error && (
        <Card className="mb-5 border-amber-200 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 text-sm text-amber-900">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}
      {busy && !snapshot ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Un instant…
          </CardContent>
        </Card>
      ) : (
        action && snapshot && (
          <>
            <ActionCard action={action} />
            <WeekStrip snapshot={snapshot} />
          </>
        )
      )}
    </AppShell>
  );
}

function DemoTodayPage() {
  const { state } = useDemo();
  const snapshot = useMemo(() => buildDemoTodaySnapshot(state), [state]);
  return (
    <TodayLayout
      brandName={snapshot.brandName}
      snapshot={snapshot}
      action={resolveNextAction(snapshot)}
      onRetry={() => undefined}
      busy={false}
    />
  );
}

function RealTodayPage() {
  const { workspace, loading: workspaceLoading, error: workspaceError, refresh } = useRealWorkspace();
  const [payload, setPayload] = useState<{ snapshot: TodaySnapshot; action: NextAction }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      try {
        const next = await fetchToday({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId
        });
        setPayload(next);
        setError(undefined);
      } catch (caught) {
        setError(
          caught instanceof TodayRequestError
            ? caught.message
            : "Impossible de charger votre journée. Réessayez."
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workspace]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const importRunning = payload?.action.kind === "IMPORT_RUNNING";
  useEffect(() => {
    if (!importRunning) return;
    const interval = window.setInterval(() => void load(true), IMPORT_POLL_INTERVAL);
    return () => window.clearInterval(interval);
  }, [importRunning, load]);

  return (
    <TodayLayout
      brandName={payload?.snapshot.brandName ?? workspace?.brandName ?? "votre restaurant"}
      snapshot={payload?.snapshot}
      action={payload?.action}
      error={workspaceError ?? error}
      onRetry={() => void (workspaceError ? refresh() : load())}
      busy={workspaceLoading || loading}
    />
  );
}

export function TodayPage({ demoMode }: { demoMode: boolean }) {
  return demoMode ? <DemoTodayPage /> : <RealTodayPage />;
}
```

- [ ] **Étape 3 : brancher la route**

Créer `apps/web/app/(product)/today/page.tsx` :

```tsx
"use client";

import { TodayPage } from "@/components/today/today-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

export default function Page() {
  return <TodayPage demoMode={isPublicDemoMode()} />;
}
```

- [ ] **Étape 4 : vérifier compilation, lint et rendu**

```bash
npm run typecheck --workspace @yokosocial/web && npm run lint --workspace @yokosocial/web
```

Puis :

```bash
npm run dev:web
```

Ouvrir `http://localhost:3000/today` (mode démo par défaut en développement).
Attendu : sur un état vierge, la carte « Collons votre site. » et aucune erreur en console.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/components/today apps/web/app/\(product\)/today
git commit -m "feat(web): écran Aujourd'hui avec une seule action à la fois"
```

---

### Tâche 8 : navigation et page d’arrivée

**Fichiers :**

- Modifier : `apps/web/components/layout/app-shell.tsx:35-45` (tableau `navigation`)
- Modifier : `apps/web/app/(auth)/login/page.tsx` (redirection après connexion)
- Modifier : `apps/web/app/(product)/onboarding/page.tsx:56` (`router.push("/import")`)

**Interfaces :**

- Consomme : la route `/today` (tâche 7).
- Produit : `/today` comme première entrée de menu et destination après connexion.

Phase 1 n’enlève aucune entrée : `/dashboard` reste servi et listé. La suppression des entrées se fait
en phases 2 et 3, une fois que « Ma semaine » les remplace.

- [ ] **Étape 1 : ajouter l’entrée de menu**

Dans `apps/web/components/layout/app-shell.tsx`, ajouter `Sun` à l’import de `lucide-react` (en
respectant l’ordre alphabétique de la liste existante) puis placer l’entrée en tête du tableau :

```ts
const navigation = [
  { href: "/today", label: "Aujourd’hui", icon: Sun },
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/posts", label: "Publications", icon: PenSquare },
  { href: "/media", label: "Médiathèque", icon: Images },
  { href: "/products", label: "Carte et produits", icon: PackageOpen },
  { href: "/establishments", label: "Établissements", icon: Store },
  { href: "/import", label: "Import du site", icon: Import },
  { href: "/social-accounts", label: "Comptes sociaux", icon: Share2 },
  { href: "/settings", label: "Paramètres", icon: Settings }
] as const;
```

- [ ] **Étape 2 : rediriger vers `/today` après connexion**

Dans `apps/web/app/(auth)/login/page.tsx:36`, remplacer :

```ts
router.push(demoMode && !state.organization ? "/onboarding" : "/dashboard");
```

par :

```ts
router.push(demoMode && !state.organization ? "/onboarding" : "/today");
```

Ne pas toucher `apps/web/app/(product)/onboarding/page.tsx:56` : la redirection y pointe vers
`/import`, ce qui reste juste en phase 1.

- [ ] **Étape 3 : vérifier**

```bash
npm run lint --workspace @yokosocial/web && npm run typecheck --workspace @yokosocial/web
```

Attendu : SUCCÈS.

- [ ] **Étape 4 : vérifier à la main**

```bash
npm run dev:web
```

Se connecter en mode démo. Attendu : arrivée sur `/today`, « Aujourd’hui » en tête de menu et surligné.

- [ ] **Étape 5 : commit**

```bash
git add apps/web/components/layout/app-shell.tsx apps/web/app/\(auth\)/login/page.tsx
git commit -m "feat(web): Aujourd'hui en tête de navigation et après connexion"
```

---

### Tâche 9 : parcours navigateur

**Fichiers :**

- Créer : `tests/e2e/today.spec.ts`

**Interfaces :**

- Consomme : la route `/today` (tâche 7) et la navigation (tâche 8).
- Produit : la garantie que l’écran change d’action au fil du parcours réel.

`playwright.config.ts` force déjà `DEMO_MODE`, `AI_MODE`, `POSTIZ_MODE` et `WEBSITE_IMPORT_MODE` à
`mock` : aucune base de données n’est nécessaire. Les libellés utilisés ci-dessous sont ceux du
parcours existant `tests/e2e/demo-flow.spec.ts` — les réutiliser tels quels.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `tests/e2e/today.spec.ts` :

```ts
import { expect, test } from "@playwright/test";

test("Aujourd’hui pose une seule question, qui change avec l’état du compte", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nom complet").fill("Responsable today");
  await page.getByLabel("Adresse e-mail").fill("today@yokosocial.local");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-demo");
  await page.getByRole("button", { name: "Créer mon espace" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nom de l’organisation").fill("Chez Marta E2E");
  await page.getByRole("button", { name: /Continuer vers l’import/ }).click();

  await expect(page).toHaveURL(/\/import/);
  await page.getByRole("link", { name: "Aujourd’hui" }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("heading", { name: "Collons votre site." })).toBeVisible();

  await page.getByRole("link", { name: "Analyser mon site" }).click();
  await page.getByRole("button", { name: /Lancer l’analyse/ }).click();
  await expect(page.getByText("Aperçu prêt à vérifier")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Aujourd’hui" }).click();
  await expect(page.getByRole("heading", { name: /plats et .* photos vous attendent/ })).toBeVisible();

  await page.getByRole("link", { name: "Import du site" }).click();
  await page.getByRole("button", { name: "Confirmer l’import" }).click();

  await page.getByRole("link", { name: "Aujourd’hui" }).click();
  await expect(page.getByRole("heading", { name: "Rien à faire aujourd’hui." })).toBeVisible();
  await expect(page.getByText("plats validés")).toBeVisible();
});
```

- [ ] **Étape 2 : lancer le test**

```bash
npx playwright test tests/e2e/today.spec.ts
```

Attendu au premier passage : SUCCÈS si les tâches 1 à 8 sont faites. En cas d’échec sur un libellé,
ouvrir la capture d’écran produite dans `test-results/` et aligner le sélecteur sur le texte réel —
**ne pas** modifier le texte de l’interface pour faire passer le test sans avoir vérifié qu’il se lit
mieux ainsi.

- [ ] **Étape 3 : lancer la vérification complète**

```bash
npm run check
```

Attendu : lint, typecheck et tests unitaires au vert sur tout le monorepo.

- [ ] **Étape 4 : commit**

```bash
git add tests/e2e/today.spec.ts
git commit -m "test(e2e): parcours de l'écran Aujourd'hui en mode démonstration"
```

---

## Vérification de fin de phase

- [ ] `npm run check` passe.
- [ ] `npx playwright test` passe.
- [ ] `npm run build` passe (c’est ce que Railway exécute).
- [ ] En mode démo, les quatre états suivants sont atteignables à la main depuis `/today` :
      site à coller, catalogue à valider, publications à valider, rien à faire.
- [ ] `/dashboard` et les neuf entrées de menu fonctionnent toujours — phase 1 n’enlève rien.
- [ ] `/today` est lisible et cliquable à 375 px de large, sans défilement horizontal : c’est là que le
      restaurateur validera sa semaine.

## Ce que la phase 1 ne fait pas

Ces points relèvent des phases suivantes et ne doivent pas être entamés ici :

- « Ma semaine », le panneau de retouche et le démontage de `real-posts-page.tsx` (phase 2) ;
- les panneaux contextuels et la sortie des pages du menu (phase 3) ;
- les réglages unifiés et l’onboarding à un champ, dont le retrait du pré-remplissage
  « YokoSushi » (phase 4) ;
- l’enrichissement de la boucle d’apprentissage. `appliedCorrections` compte pour l’instant les
  `UserFeedback` existants et la ligne « vos N dernières corrections » ne s’affiche que si ce nombre
  est supérieur à zéro (phase 5) ;
- le calendrier glisser-déposer (phase 6).
