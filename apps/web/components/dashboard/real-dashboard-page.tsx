"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Images,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Sparkles,
  WandSparkles
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  requestJson,
  type RealMediaAsset,
  type RealPost,
  type RealProduct
} from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import { pollingIntervalLabel, publicationPollingInterval } from "@/lib/publication-polling";

const focusItems = ["Un plateau", "La livraison", "Le restaurant", "Un produit précis"];
const activeImportStatuses = new Set(["PENDING", "CRAWLING", "ANALYZING", "IMPORTING"]);

type WebsiteImportSummary = {
  id: string;
  websiteUrl: string;
  mode: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  pagesDetected: number;
  pagesScanned: number;
  productsDetected: number;
  productsImported: number;
  categoriesDetected: number;
  imagesDetected: number;
  imagesImported: number;
  duplicatesDetected: number;
  imagesTooSmall: number;
  warningsCount: number;
  errorsCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function importStatusLabel(status: string): string {
  return (
    {
      PENDING: "En attente",
      CRAWLING: "Analyse des pages",
      ANALYZING: "Analyse des contenus",
      WAITING_FOR_REVIEW: "Validation requise",
      IMPORTING: "Import en cours",
      COMPLETED: "Terminé",
      PARTIALLY_COMPLETED: "Partiellement terminé",
      FAILED: "Échec",
      CANCELLED: "Annulé"
    }[status] ?? status
  );
}

export function RealDashboardPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [posts, setPosts] = useState<RealPost[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [mediaTotal, setMediaTotal] = useState<number>();
  const [productsTotal, setProductsTotal] = useState<number>();
  const [imports, setImports] = useState<WebsiteImportSummary[]>([]);
  const [importsLoaded, setImportsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>();

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      const query = new URLSearchParams({
        organizationId: workspace.organizationId,
        brandId: workspace.brandId
      });
      const [postResult, mediaResult, productResult, importResult] = await Promise.allSettled([
        requestJson<{ posts: RealPost[] }>(`/api/posts?${query}`),
        requestJson<{
          media?: RealMediaAsset[];
          pagination: { total: number };
        }>(`/api/media?${query}&limit=1`),
        requestJson<{
          products?: RealProduct[];
          pagination: { total: number };
        }>(`/api/products?${query}&limit=1`),
        requestJson<{ imports: WebsiteImportSummary[] }>(`/api/imports?${query}&limit=5`)
      ]);

      const failures: string[] = [];
      if (postResult.status === "fulfilled") {
        setPosts(postResult.value.posts);
        setPostsLoaded(true);
      } else failures.push("publications");
      if (mediaResult.status === "fulfilled") setMediaTotal(mediaResult.value.pagination.total);
      else failures.push("médias");
      if (productResult.status === "fulfilled") {
        setProductsTotal(productResult.value.pagination.total);
      } else failures.push("produits");
      if (importResult.status === "fulfilled") {
        setImports(importResult.value.imports);
        setImportsLoaded(true);
      } else failures.push("imports");

      setError(
        failures.length
          ? `Certaines données réelles n’ont pas pu être chargées : ${failures.join(", ")}.`
          : undefined
      );
      setLastRefreshedAt(new Date());
      if (!silent) setLoading(false);
    },
    [workspace]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const latestImport = imports[0];
  const publicationPollInterval = publicationPollingInterval(posts);
  const importPollInterval =
    latestImport && activeImportStatuses.has(latestImport.status) ? 8_000 : undefined;
  const dashboardPollInterval =
    publicationPollInterval && importPollInterval
      ? Math.min(publicationPollInterval, importPollInterval)
      : (publicationPollInterval ?? importPollInterval);
  const hasActiveWork = Boolean(dashboardPollInterval);

  useEffect(() => {
    if (!dashboardPollInterval) return;
    const interval = window.setInterval(() => void loadDashboard(true), dashboardPollInterval);
    return () => window.clearInterval(interval);
  }, [dashboardPollInterval, loadDashboard]);

  const upcomingPosts = useMemo(
    () =>
      posts
        .filter(
          (post) => Boolean(post.scheduledAt) && ["SCHEDULED", "PUBLISHING"].includes(post.status)
        )
        .sort(
          (left, right) =>
            new Date(left.scheduledAt ?? 0).getTime() - new Date(right.scheduledAt ?? 0).getTime()
        )
        .slice(0, 3),
    [posts]
  );

  const metrics = [
    {
      label: "À valider",
      value: postsLoaded
        ? posts.filter((post) => post.status === "PENDING_REVIEW").length
        : undefined,
      icon: CheckCircle2,
      tone: "amber" as const
    },
    {
      label: "Approuvées",
      value: postsLoaded ? posts.filter((post) => post.status === "APPROVED").length : undefined,
      icon: CheckCircle2,
      tone: "green" as const
    },
    {
      label: "Programmées",
      value: postsLoaded ? posts.filter((post) => post.status === "SCHEDULED").length : undefined,
      icon: CalendarClock,
      tone: "blue" as const
    },
    {
      label: "En erreur",
      value: postsLoaded ? posts.filter((post) => post.status === "FAILED").length : undefined,
      icon: CircleAlert,
      tone: "rose" as const
    }
  ];
  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Vue d’ensemble · données réelles"
        title={`Bonjour, prêt pour ${workspace?.brandName ?? "la semaine"} ?`}
        description="Cette synthèse provient uniquement de votre organisation. Les publications restent bloquées jusqu’à leur approbation explicite."
        action={
          <Button asChild>
            <Link href="/posts">
              <WandSparkles className="size-4" /> Générer 5 publications
            </Link>
          </Button>
        }
      />

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadDashboard())}
          >
            Réessayer
          </Button>
        </div>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement de la synthèse réelle…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone="green">Espace réel · {workspace?.organizationName}</Badge>
            {hasActiveWork && (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="size-3.5 animate-spin" /> Rafraîchissement toutes les{" "}
                {pollingIntervalLabel(dashboardPollInterval ?? 8_000)}
              </span>
            )}
            {lastRefreshedAt && (
              <span>
                Actualisé à {lastRefreshedAt.toLocaleTimeString("fr-FR", { timeStyle: "short" })}
              </span>
            )}
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label}>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{metric.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      {metric.value ?? "—"}
                    </p>
                  </div>
                  <span className="grid size-11 place-items-center rounded-xl bg-slate-50 text-slate-500">
                    <metric.icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <Card className="bg-yoko-ink overflow-hidden text-white">
              <CardContent className="relative p-6 sm:p-8">
                <div className="absolute -top-20 -right-12 size-64 rounded-full bg-rose-400/20 blur-3xl" />
                <div className="relative">
                  <div className="mb-4 flex items-center gap-2 text-xs font-bold tracking-[.14em] text-rose-300 uppercase">
                    <Sparkles className="size-4" /> Brief de la semaine
                  </div>
                  <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                    Que souhaitez-vous mettre en avant cette semaine ?
                  </h2>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {focusItems.map((item) => (
                      <Link
                        key={item}
                        href="/posts"
                        className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200 ring-1 ring-white/10 transition hover:bg-white hover:text-slate-950"
                      >
                        {item}
                      </Link>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Votre bibliothèque réelle
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Total enregistré pour la marque</p>
                  </div>
                  <Images className="size-5 text-rose-500" />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-2xl font-semibold text-slate-950">{mediaTotal ?? "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">médias</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-2xl font-semibold text-slate-950">{productsTotal ?? "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">produits</p>
                  </div>
                </div>
                <Button asChild className="mt-5 w-full" variant="secondary">
                  <Link href={mediaTotal || productsTotal ? "/media" : "/import"}>
                    {mediaTotal || productsTotal ? "Voir les contenus" : "Commencer l’import"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardContent>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-950">Prochaines publications</h2>
                  <Badge tone="blue">Calendrier réel</Badge>
                </div>
                {!postsLoaded ? (
                  <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-8 text-center">
                    <CircleAlert className="mx-auto size-7 text-amber-400" />
                    <p className="mt-3 text-sm font-medium text-amber-900">
                      Publications temporairement indisponibles
                    </p>
                  </div>
                ) : upcomingPosts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <CalendarClock className="mx-auto size-7 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      Aucune publication programmée
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Générez, validez puis choisissez une date future.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingPosts.map((post) => (
                      <Link
                        key={post.id}
                        href="/posts"
                        className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition hover:bg-slate-100"
                      >
                        <div className="grid size-10 place-items-center rounded-lg bg-white text-rose-500">
                          <CalendarClock className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{post.title}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(post.scheduledAt ?? 0).toLocaleString("fr-FR", {
                              dateStyle: "medium",
                              timeStyle: "short"
                            })}
                          </p>
                        </div>
                        <Badge tone={post.status === "PUBLISHING" ? "amber" : "blue"}>
                          {post.status === "PUBLISHING" ? "Publication" : "Programmée"}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-950">Dernier import réel</h2>
                  {!importsLoaded ? (
                    <Badge tone="amber">Indisponible</Badge>
                  ) : latestImport ? (
                    <Badge
                      tone={
                        latestImport.status === "COMPLETED"
                          ? "green"
                          : latestImport.status === "FAILED"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {importStatusLabel(latestImport.status)}
                    </Badge>
                  ) : (
                    <Badge tone="slate">Aucun import</Badge>
                  )}
                </div>
                {!importsLoaded ? (
                  <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-8 text-center">
                    <CircleAlert className="mx-auto size-7 text-amber-400" />
                    <p className="mt-3 text-sm font-medium text-amber-900">
                      Historique des imports temporairement indisponible
                    </p>
                  </div>
                ) : latestImport ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-4 rounded-xl bg-slate-50 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-rose-500 shadow-sm">
                        <PackageOpen className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {latestImport.websiteUrl}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {latestImport.pagesScanned} page(s) · {latestImport.productsImported}
                          produit(s) · {latestImport.imagesImported} image(s) importée(s)
                        </p>
                      </div>
                    </div>
                    {(latestImport.warningsCount > 0 || latestImport.errorsCount > 0) && (
                      <p className="text-xs text-amber-700">
                        {latestImport.warningsCount} avertissement(s) · {latestImport.errorsCount}
                        erreur(s). Consultez le compte rendu avant validation.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                    <PackageOpen className="mx-auto size-7 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-700">Aucune analyse lancée</p>
                  </div>
                )}
                <Button asChild className="mt-5 w-full" variant="secondary">
                  <Link href="/import">
                    Ouvrir l’import <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}
