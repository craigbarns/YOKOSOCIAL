"use client";

import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import {
  Archive,
  Check,
  ExternalLink,
  Filter,
  ImageIcon,
  LoaderCircle,
  Pencil,
  Save,
  Search,
  Sparkles,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  mediaItems,
  mediaTitle,
  requestJson,
  type RealEstablishment,
  type RealMediaAsset
} from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";

type MediaFilter = "all" | "best" | "unused" | "review";

const mediaCategories = [
  "LOGO",
  "PRODUCT",
  "PLATTER",
  "RESTAURANT",
  "AMBIANCE",
  "TEAM",
  "DELIVERY",
  "PROMOTION",
  "DECORATION",
  "TECHNICAL",
  "UNCLASSIFIED"
] as const;

const editorialCategories = [
  "SUSHI",
  "MAKI",
  "CALIFORNIA",
  "SASHIMI",
  "NIGIRI",
  "POKE",
  "PLATTER",
  "MENU",
  "DESSERT",
  "DRINK",
  "RESTAURANT",
  "TERRACE",
  "AMBIANCE",
  "TEAM",
  "DELIVERY",
  "LOGO",
  "PROMOTION",
  "UNCLASSIFIED"
] as const;

const mediaStatuses = [
  "APPROVED",
  "NEEDS_REVIEW",
  "LOW_QUALITY",
  "REJECTED",
  "ARCHIVED",
  "SOURCE_NOT_FOUND"
] as const;

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function statusLabel(status: string): string {
  return (
    {
      APPROVED: "Approuvée",
      NEEDS_REVIEW: "À vérifier",
      LOW_QUALITY: "Qualité faible",
      REJECTED: "Refusée",
      ARCHIVED: "Archivée",
      SOURCE_NOT_FOUND: "Source absente"
    }[status] ?? status
  );
}

export function RealMediaPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [media, setMedia] = useState<RealMediaAsset[]>([]);
  const [establishments, setEstablishments] = useState<RealEstablishment[]>([]);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [category, setCategory] = useState("");
  const [establishmentId, setEstablishmentId] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [editCategory, setEditCategory] =
    useState<(typeof mediaCategories)[number]>("UNCLASSIFIED");
  const [editEditorial, setEditEditorial] =
    useState<(typeof editorialCategories)[number]>("UNCLASSIFIED");
  const [editStatus, setEditStatus] = useState<(typeof mediaStatuses)[number]>("NEEDS_REVIEW");
  const [editEstablishments, setEditEstablishments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const deferredQuery = useDeferredValue(query.trim());

  const loadMedia = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(undefined);
    const params = new URLSearchParams({
      organizationId: workspace.organizationId,
      brandId: workspace.brandId,
      page: String(page),
      limit: "48"
    });
    if (deferredQuery) params.set("search", deferredQuery);
    if (category) params.set("category", category);
    if (establishmentId) params.set("establishmentId", establishmentId);
    if (filter === "best") params.set("bestInstagram", "true");
    if (filter === "unused") params.set("neverUsed", "true");
    if (filter === "review") params.set("review", "true");
    try {
      const [mediaPayload, establishmentPayload] = await Promise.all([
        requestJson<{
          media?: RealMediaAsset[];
          mediaAssets?: RealMediaAsset[];
          pagination?: { total: number; pages: number };
        }>(`/api/media?${params}`),
        requestJson<{ establishments: RealEstablishment[] }>(
          `/api/establishments?organizationId=${encodeURIComponent(workspace.organizationId)}&brandId=${encodeURIComponent(workspace.brandId)}`
        )
      ]);
      setMedia(mediaItems(mediaPayload));
      setTotal(mediaPayload.pagination?.total ?? mediaItems(mediaPayload).length);
      setPages(Math.max(1, mediaPayload.pagination?.pages ?? 1));
      setEstablishments(establishmentPayload.establishments);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement de la médiathèque impossible."
      );
    } finally {
      setLoading(false);
    }
  }, [category, deferredQuery, establishmentId, filter, page, workspace]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  const editing = media.find((item) => item.id === editingId);
  useEffect(() => {
    if (!editing) return;
    setEditCategory((editing.category ?? "UNCLASSIFIED") as (typeof mediaCategories)[number]);
    setEditEditorial(editing.editorialCategory as (typeof editorialCategories)[number]);
    setEditStatus(editing.status as (typeof mediaStatuses)[number]);
    setEditEstablishments(editing.establishments?.map((item) => item.id) ?? []);
  }, [editing]);

  async function saveCorrection() {
    if (!workspace || !editing) return;
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson("/api/media", {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          mediaAssetId: editing.id,
          category: editCategory,
          editorialCategory: editEditorial,
          status: editStatus,
          establishmentIds: editEstablishments
        })
      });
      setNotice("Classification et association du média enregistrées.");
      setEditingId(undefined);
      await loadMedia();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Correction du média impossible.");
    } finally {
      setSaving(false);
    }
  }

  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Bibliothèque visuelle · données réelles"
        title="Médiathèque"
        description="Chaque fichier affiché est une copie stockée par l’application. La source reste traçable et les originaux ne sont jamais modifiés."
        action={<Badge tone="green">{total} média(s) réel(s)</Badge>}
      />

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadMedia())}
          >
            Réessayer
          </Button>
        </div>
      )}
      {notice && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <Card className="mb-5">
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-center">
          <label className="relative">
            <Search className="absolute top-3 left-3.5 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Rechercher un produit, une catégorie…"
              className={`${fieldClass} pl-10`}
            />
          </label>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
            aria-label="Catégorie de média"
          >
            <option value="">Toutes les catégories</option>
            {mediaCategories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={establishmentId}
            onChange={(event) => {
              setEstablishmentId(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
            aria-label="Établissement"
          >
            <option value="">Tous les établissements</option>
            {establishments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 overflow-x-auto lg:col-span-3">
            {(
              [
                ["all", "Toutes", Filter],
                ["best", "Meilleures pour Instagram", Sparkles],
                ["unused", "Jamais utilisées", ImageIcon],
                ["review", "À vérifier", Archive]
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFilter(id);
                  setPage(1);
                }}
                className={cn(
                  "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold ring-1 transition",
                  filter === id
                    ? "bg-yoko-ink ring-yoko-ink text-white"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <div className="bg-yoko-ink mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm text-white">
          <span>{selected.length} média(s) sélectionné(s)</span>
          <Button size="sm" variant="secondary" onClick={() => setSelected([])}>
            <X className="size-4" /> Annuler la sélection
          </Button>
        </div>
      )}

      {editing && (
        <Card className="mb-5 border-rose-200">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Corriger « {mediaTitle(editing)} »</p>
                <p className="mt-1 text-xs text-slate-500">
                  Cette correction est enregistrée dans votre organisation et ne modifie pas le
                  fichier original.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditingId(undefined)}
                aria-label="Fermer"
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-semibold">Type de média</span>
                <select
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value as typeof editCategory)}
                  className={fieldClass}
                >
                  {mediaCategories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold">Catégorie éditoriale</span>
                <select
                  value={editEditorial}
                  onChange={(event) => setEditEditorial(event.target.value as typeof editEditorial)}
                  className={fieldClass}
                >
                  {editorialCategories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold">Statut</span>
                <select
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as typeof editStatus)}
                  className={fieldClass}
                >
                  {mediaStatuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold">Établissements associés</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {establishments.map((item) => {
                  const checked = editEstablishments.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setEditEstablishments((current) =>
                          checked ? current.filter((id) => id !== item.id) : [...current, item.id]
                        )
                      }
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                        checked
                          ? "bg-rose-50 text-rose-700 ring-rose-200"
                          : "bg-white text-slate-600 ring-slate-200"
                      )}
                    >
                      {checked && <Check className="mr-1 inline size-3" />}
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Button onClick={() => void saveCorrection()} disabled={saving}>
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Enregistrer la correction
            </Button>
          </CardContent>
        </Card>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement des copies stockées…
          </CardContent>
        </Card>
      ) : media.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ImageIcon className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Aucun média réel pour ce filtre</h2>
            <p className="mt-2 text-sm text-slate-500">
              Lancez ou validez un import pour alimenter la médiathèque.
            </p>
            <Button asChild className="mt-5" variant="secondary">
              <Link href="/import">Ouvrir l’import</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {media.map((asset) => {
            const checked = selected.includes(asset.id);
            const instagramScore =
              asset.potentialScores?.instagram ?? asset.instagramPotentialScore ?? 0;
            return (
              <article
                key={asset.id}
                className={cn(
                  "group overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
                  checked ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-200"
                )}
              >
                <button
                  type="button"
                  className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left"
                  onClick={() =>
                    setSelected((current) =>
                      checked ? current.filter((id) => id !== asset.id) : [...current, asset.id]
                    )
                  }
                >
                  {asset.publicUrl || asset.sourceUrl ? (
                    <img
                      src={(asset.publicUrl ?? asset.sourceUrl) || undefined}
                      alt={asset.altText ?? mediaTitle(asset)}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      onError={(e) => {
                        if (asset.sourceUrl && e.currentTarget.src !== asset.sourceUrl) {
                          e.currentTarget.src = asset.sourceUrl;
                        }
                      }}
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-slate-300">
                      <ImageIcon className="size-9" />
                    </span>
                  )}
                  <span
                    className={cn(
                      "absolute top-3 left-3 grid size-5 place-items-center rounded-md border-2",
                      checked
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-white bg-white/70"
                    )}
                  >
                    {checked && "✓"}
                  </span>
                  <Badge
                    className="absolute top-3 right-3 bg-white/90"
                    tone={
                      asset.qualityScore >= 80
                        ? "green"
                        : asset.qualityScore >= 55
                          ? "amber"
                          : "rose"
                    }
                  >
                    {asset.qualityScore}/100
                  </Badge>
                  <span className="absolute right-3 bottom-3 rounded-md bg-slate-950/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                    RÉEL
                  </span>
                </button>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold text-slate-900">
                        {mediaTitle(asset)}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {asset.width ?? "?"} × {asset.height ?? "?"} · {asset.editorialCategory}
                      </p>
                    </div>
                    <Badge>{asset.category ?? "UNCLASSIFIED"}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 text-[10px] text-slate-600">
                    <span>Instagram {instagramScore}/100</span>
                    <span>{asset.usageCount ?? 0} utilisation(s)</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <Badge
                      tone={
                        asset.status === "APPROVED"
                          ? "green"
                          : asset.status === "NEEDS_REVIEW"
                            ? "amber"
                            : "rose"
                      }
                    >
                      {statusLabel(asset.status)}
                    </Badge>
                    <div className="flex gap-1">
                      {asset.sourcePageUrl && (
                        <Button asChild size="icon" variant="ghost" title="Voir la page source">
                          <a href={asset.sourcePageUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(asset.id)}>
                        <Pencil className="size-3.5" /> Corriger
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!busy && pages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Pages des médias">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Précédent
          </Button>
          <span className="text-sm text-slate-600">
            Page {page} sur {pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pages}
            onClick={() => setPage((current) => Math.min(pages, current + 1))}
          >
            Suivant
          </Button>
        </nav>
      )}
    </AppShell>
  );
}
