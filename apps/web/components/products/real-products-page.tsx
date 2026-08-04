"use client";

import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  ImageIcon,
  LoaderCircle,
  PackageOpen,
  Pencil,
  Save,
  Search,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  productItems,
  requestJson,
  type RealEstablishment,
  type RealProduct
} from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function productSource(product: RealProduct): string | null {
  return product.sources?.productUrl ?? product.sources?.pageUrl ?? product.sourceUrl ?? null;
}

function formatPrice(value: string | number | null, currency: string): string {
  if (value === null || value === "") return "Prix non renseigné";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount);
}

function statusLabel(status: string): string {
  return (
    {
      ACTIVE: "Actif",
      DRAFT: "Brouillon",
      UNAVAILABLE: "Indisponible",
      NEEDS_REVIEW: "À vérifier",
      ARCHIVED: "Archivé",
      SOURCE_NOT_FOUND: "Source absente"
    }[status] ?? status
  );
}

export function RealProductsPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [products, setProducts] = useState<RealProduct[]>([]);
  const [establishments, setEstablishments] = useState<RealEstablishment[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editEstablishments, setEditEstablishments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Array<[string, string]>>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const deferredQuery = useDeferredValue(query.trim());

  const loadProducts = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(undefined);
    const params = new URLSearchParams({
      organizationId: workspace.organizationId,
      brandId: workspace.brandId,
      page: String(page),
      limit: "50"
    });
    if (deferredQuery) params.set("search", deferredQuery);
    if (category) params.set("categoryId", category);
    if (status) params.set("status", status);
    try {
      const [productPayload, establishmentPayload] = await Promise.all([
        requestJson<{
          products?: RealProduct[];
          menuItems?: RealProduct[];
          categories?: Array<{ id: string; name: string }>;
          pagination?: { total: number; pages: number };
        }>(`/api/products?${params}`),
        requestJson<{ establishments: RealEstablishment[] }>(
          `/api/establishments?organizationId=${encodeURIComponent(workspace.organizationId)}&brandId=${encodeURIComponent(workspace.brandId)}`
        )
      ]);
      setProducts(productItems(productPayload));
      setTotal(productPayload.pagination?.total ?? productItems(productPayload).length);
      setPages(Math.max(1, productPayload.pagination?.pages ?? 1));
      setCategories((productPayload.categories ?? []).map((item) => [item.id, item.name]));
      setEstablishments(establishmentPayload.establishments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement des produits impossible.");
    } finally {
      setLoading(false);
    }
  }, [category, deferredQuery, page, status, workspace]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const editing = products.find((item) => item.id === editingId);
  useEffect(() => {
    if (!editing) return;
    setEditName(editing.name);
    setEditDescription(editing.description ?? "");
    setEditPrice(editing.price === null ? "" : String(editing.price));
    setEditCategoryId(editing.category?.id ?? "");
    setEditEstablishments(editing.establishments?.map((item) => item.id) ?? []);
  }, [editing]);

  async function saveProduct() {
    if (!workspace || !editing) return;
    if (!editName.trim()) {
      setError("Le nom du produit est obligatoire.");
      return;
    }
    if (editPrice && !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(editPrice)) {
      setError("Le prix doit utiliser un point décimal et comporter au maximum deux décimales.");
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson("/api/products", {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          menuItemId: editing.id,
          name: editName.trim(),
          description: editDescription.trim() || null,
          categoryId: editCategoryId || null,
          price: editPrice || null,
          priceConfirmed: true,
          establishmentIds: editEstablishments
        })
      });
      setNotice("Produit corrigé. Le prix saisi a été explicitement confirmé.");
      setEditingId(undefined);
      await loadProducts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Correction du produit impossible.");
    } finally {
      setSaving(false);
    }
  }

  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Catalogue · données réelles"
        title="Carte et produits"
        description="Les prix, descriptions et associations locales restent liés à leur source. Une modification de prix exige une confirmation explicite."
        action={<Badge tone="green">{total} produit(s) réel(s)</Badge>}
      />

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadProducts())}
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
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(240px,1fr)_220px_220px]">
          <label className="relative">
            <Search className="absolute top-3 left-3.5 size-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Rechercher dans la carte…"
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
            aria-label="Catégorie"
          >
            <option value="">Toutes les catégories</option>
            {categories.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
            aria-label="Statut"
          >
            <option value="">Tous les statuts</option>
            {["ACTIVE", "NEEDS_REVIEW", "DRAFT", "UNAVAILABLE", "SOURCE_NOT_FOUND", "ARCHIVED"].map(
              (item) => (
                <option key={item} value={item}>
                  {statusLabel(item)}
                </option>
              )
            )}
          </select>
        </CardContent>
      </Card>

      {editing && (
        <Card className="mb-5 border-rose-200">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Corriger « {editing.name} »</p>
                <p className="mt-1 text-xs text-slate-500">
                  Vérifiez la page source avant de confirmer un prix ou une association locale.
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
            <div className="grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-xs font-semibold">Nom</span>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold">Catégorie</span>
                <select
                  value={editCategoryId}
                  onChange={(event) => setEditCategoryId(event.target.value)}
                  className={fieldClass}
                >
                  <option value="">Sans catégorie</option>
                  {categories.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold">Description</span>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold">Prix confirmé en EUR</span>
                <input
                  inputMode="decimal"
                  value={editPrice}
                  onChange={(event) => setEditPrice(event.target.value.replace(",", "."))}
                  placeholder="Ex. 14.90"
                  className={fieldClass}
                />
              </label>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4" /> Information critique
                </p>
                <p className="mt-1">
                  Enregistrer ce formulaire confirme explicitement le prix affiché.
                </p>
              </div>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold">Disponible dans les établissements</legend>
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
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void saveProduct()} disabled={saving}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Enregistrer et confirmer le prix
              </Button>
              {productSource(editing) && (
                <Button asChild variant="secondary">
                  <a href={productSource(editing) ?? "#"} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" /> Vérifier la source
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement de la carte réelle…
          </CardContent>
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <PackageOpen className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Aucun produit réel pour ce filtre</h2>
            <p className="mt-2 text-sm text-slate-500">
              Analysez le site puis validez les produits détectés.
            </p>
            <Button asChild className="mt-5" variant="secondary">
              <Link href="/import">Analyser yokosushi.fr</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-slate-100 p-0">
            {products.map((product) => (
              <article
                key={product.id}
                className="grid gap-4 p-5 md:grid-cols-[88px_minmax(0,1fr)_auto] md:items-center"
              >
                <div className="aspect-square overflow-hidden rounded-xl bg-slate-100">
                  {product.recommendedMedia?.publicUrl || product.recommendedMedia?.sourceUrl ? (
                    <img
                      src={
                        (product.recommendedMedia.publicUrl ??
                          product.recommendedMedia.sourceUrl) ||
                        undefined
                      }
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        if (
                          product.recommendedMedia?.sourceUrl &&
                          e.currentTarget.src !== product.recommendedMedia.sourceUrl
                        ) {
                          e.currentTarget.src = product.recommendedMedia.sourceUrl;
                        }
                      }}
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-slate-300">
                      <ImageIcon className="size-7" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">{product.name}</h2>
                    {product.category && <Badge>{product.category.name}</Badge>}
                    <Badge
                      tone={
                        product.status === "ACTIVE"
                          ? "green"
                          : product.status === "NEEDS_REVIEW"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {statusLabel(product.status)}
                    </Badge>
                    <Badge tone={product.validationStatus === "APPROVED" ? "green" : "amber"}>
                      {product.validationStatus === "APPROVED" ? "Validé" : "À valider"}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-slate-500">
                    {product.description ?? "Aucune description importée."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {(product.establishments ?? []).map((item) => (
                      <span key={item.id} className="rounded-md bg-slate-100 px-2 py-1">
                        {item.name}
                      </span>
                    ))}
                    {product.confidence !== undefined && (
                      <span>Confiance source {Math.round(product.confidence * 100)}%</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 md:block md:text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      product.price === null ? "text-slate-400" : "text-slate-900"
                    )}
                  >
                    {formatPrice(product.price, product.currency)}
                  </p>
                  <div className="mt-2 flex justify-end gap-1">
                    {productSource(product) && (
                      <Button asChild size="icon" variant="ghost" title="Page source">
                        <a href={productSource(product) ?? "#"} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(product.id)}>
                      <Pencil className="size-3.5" /> Corriger
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      )}

      {!busy && pages > 1 && (
        <nav
          className="mt-5 flex items-center justify-center gap-3"
          aria-label="Pages des produits"
        >
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
