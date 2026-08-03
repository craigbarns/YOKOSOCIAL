"use client";

import { Badge, Button, Card, CardContent, Progress, cn } from "@yokosocial/ui";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe2,
  ImageIcon,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  Search,
  Store,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import {
  isIngestedMediaReviewStatus,
  type ImportMediaDecision
} from "@/lib/import-review-contract";

type ImportStatus =
  | "PENDING"
  | "CRAWLING"
  | "ANALYZING"
  | "WAITING_FOR_REVIEW"
  | "IMPORTING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

type ImportedDatum = {
  id: string;
  type: string;
  key: string;
  value: unknown;
  normalizedValue: string | null;
  sourceUrl: string;
  confidence: number;
  critical: boolean;
  validationStatus: string;
  establishmentId: string | null;
};

type ImportedMedia = {
  id: string;
  publicUrl: string | null;
  detectedTitle: string | null;
  originalName: string;
  sourceUrl: string;
  sourcePageUrl: string;
  width: number | null;
  height: number | null;
  qualityScore: number;
  category: string;
  editorialCategory: string;
  status: string;
};

type RealWebsiteImport = {
  id: string;
  websiteUrl: string;
  status: ImportStatus;
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
  importedData?: ImportedDatum[];
  mediaAssets?: ImportedMedia[];
  brand: {
    id: string;
    name: string;
    establishments?: Array<{
      id: string;
      name: string;
      city: string | null;
      addressLine1: string | null;
      postalCode: string | null;
      phone: string | null;
      validationStatus: string;
    }>;
  };
};

type ImportDetailPagination = {
  importedData: { included: boolean; total: number; nextCursor: string | null };
  mediaAssets: { included: boolean; total: number; nextCursor: string | null };
};

const activeStatuses = new Set<ImportStatus>(["PENDING", "CRAWLING", "ANALYZING", "IMPORTING"]);

const statusLabels: Record<ImportStatus, string> = {
  PENDING: "En attente du worker",
  CRAWLING: "Analyse des pages",
  ANALYZING: "Structuration des contenus",
  WAITING_FOR_REVIEW: "Validation humaine requise",
  IMPORTING: "Import des contenus validés",
  COMPLETED: "Import terminé",
  PARTIALLY_COMPLETED: "Import partiellement terminé",
  FAILED: "Import en erreur",
  CANCELLED: "Import annulé"
};

function progressFor(websiteImport: RealWebsiteImport): number {
  switch (websiteImport.status) {
    case "PENDING":
      return 8;
    case "CRAWLING":
      return websiteImport.pagesDetected > 0
        ? Math.min(
            60,
            15 + Math.round((websiteImport.pagesScanned / websiteImport.pagesDetected) * 45)
          )
        : 25;
    case "ANALYZING":
      return 75;
    case "IMPORTING":
      return 90;
    default:
      return 100;
  }
}

function displayValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "Valeur détectée";
  const record = value as Record<string, unknown>;
  const address = record.address;
  if (address && typeof address === "object" && !Array.isArray(address)) {
    const fields = address as Record<string, unknown>;
    return [fields.street, fields.postalCode, fields.city, fields.formatted]
      .filter((item): item is string => typeof item === "string" && Boolean(item))
      .filter((item, index, values) => values.indexOf(item) === index)
      .join(" · ");
  }
  if (typeof record.price === "number") return `${record.price.toFixed(2)} €`;
  if (typeof record.name === "string") return record.name;
  return "Valeur structurée détectée";
}

function sourceLabel(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).pathname || "/";
  } catch {
    return "Source";
  }
}

function mediaIngestionStatus(item: ImportedDatum): string | undefined {
  if (!item.value || typeof item.value !== "object" || Array.isArray(item.value)) return undefined;
  const value = item.value as Record<string, unknown>;
  if (value.kind !== "MEDIA_CANDIDATE") return undefined;
  return typeof value.ingestionStatus === "string" ? value.ingestionStatus : "PENDING";
}

function isMediaCandidate(item: ImportedDatum): boolean {
  return mediaIngestionStatus(item) !== undefined;
}

function mediaCandidateSource(item: ImportedDatum): string {
  if (!item.value || typeof item.value !== "object" || Array.isArray(item.value))
    return item.sourceUrl;
  const sourceUrl = (item.value as Record<string, unknown>).sourceUrl;
  return typeof sourceUrl === "string" ? sourceUrl : item.sourceUrl;
}

function automaticMediaStatusLabel(status: string): string {
  return (
    {
      APPROVED: "Heuristique : qualité élevée",
      NEEDS_REVIEW: "Heuristique : à vérifier",
      LOW_QUALITY: "Heuristique : qualité faible"
    }[status] ?? status
  );
}

export function RealImportPage() {
  const { workspace, loading: workspaceLoading, error: workspaceError } = useRealWorkspace();
  const [websiteImport, setWebsiteImport] = useState<RealWebsiteImport>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<"establishments" | "products" | "media">("establishments");
  const [approvedDataIds, setApprovedDataIds] = useState<Set<string>>(new Set());
  const [mediaDecisions, setMediaDecisions] = useState<Record<string, ImportMediaDecision>>({});
  const [selectionInitializedFor, setSelectionInitializedFor] = useState<string>();

  const loadDetails = useCallback(
    async (importId: string) => {
      if (!workspace) return;
      let includeData = true;
      let includeMedia = true;
      let dataAfter: string | undefined;
      let mediaAfter: string | undefined;
      const seenDataCursors = new Set<string>();
      const seenMediaCursors = new Set<string>();
      const importedData: ImportedDatum[] = [];
      const mediaAssets: ImportedMedia[] = [];
      let completeImport: RealWebsiteImport | undefined;

      while (includeData || includeMedia) {
        const params = new URLSearchParams({
          organizationId: workspace.organizationId,
          includeData: String(includeData),
          includeMedia: String(includeMedia),
          pageSize: "250"
        });
        if (dataAfter) params.set("dataAfter", dataAfter);
        if (mediaAfter) params.set("mediaAfter", mediaAfter);
        const response = await fetch(
          `/api/imports/${encodeURIComponent(importId)}?${params.toString()}`,
          { cache: "no-store", headers: { accept: "application/json" } }
        );
        if (!response.ok) throw new Error("Impossible de récupérer le compte rendu d’import.");
        const payload = (await response.json()) as {
          import: RealWebsiteImport;
          pagination: ImportDetailPagination;
        };
        completeImport = payload.import;
        if (includeData) importedData.push(...(payload.import.importedData ?? []));
        if (includeMedia) mediaAssets.push(...(payload.import.mediaAssets ?? []));

        const nextDataCursor = payload.pagination.importedData.nextCursor;
        const nextMediaCursor = payload.pagination.mediaAssets.nextCursor;
        if (nextDataCursor) {
          if (seenDataCursors.has(nextDataCursor)) {
            throw new Error("La pagination des données d’import n’a pas pu être finalisée.");
          }
          seenDataCursors.add(nextDataCursor);
          dataAfter = nextDataCursor;
        }
        if (nextMediaCursor) {
          if (seenMediaCursors.has(nextMediaCursor)) {
            throw new Error("La pagination des médias d’import n’a pas pu être finalisée.");
          }
          seenMediaCursors.add(nextMediaCursor);
          mediaAfter = nextMediaCursor;
        }
        includeData = nextDataCursor !== null;
        includeMedia = nextMediaCursor !== null;
      }

      if (!completeImport) throw new Error("Le compte rendu d’import est vide.");
      setWebsiteImport({ ...completeImport, importedData, mediaAssets });
    },
    [workspace]
  );

  useEffect(() => {
    if (!workspace) {
      if (!workspaceLoading) setLoading(false);
      return;
    }
    const currentWorkspace = workspace;
    let cancelled = false;
    async function loadLatest() {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(
          `/api/imports?organizationId=${encodeURIComponent(currentWorkspace.organizationId)}&brandId=${encodeURIComponent(currentWorkspace.brandId)}&limit=1`,
          { cache: "no-store", headers: { accept: "application/json" } }
        );
        if (!response.ok) throw new Error("Impossible de charger les imports.");
        const payload = (await response.json()) as { imports: RealWebsiteImport[] };
        const latest = payload.imports[0];
        if (!cancelled && latest) await loadDetails(latest.id);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Chargement impossible.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, [loadDetails, workspace, workspaceLoading]);

  const mediaCandidates = useMemo(
    () => websiteImport?.importedData?.filter(isMediaCandidate) ?? [],
    [websiteImport]
  );
  const mediaIngestionPending = mediaCandidates.some(
    (item) => mediaIngestionStatus(item) === "PENDING"
  );
  const failedMediaCandidates = useMemo(
    () =>
      mediaCandidates.filter((item) =>
        ["FAILED", "MISSING"].includes(mediaIngestionStatus(item) ?? "")
      ),
    [mediaCandidates]
  );
  const duplicateMediaCandidates = useMemo(
    () => mediaCandidates.filter((item) => mediaIngestionStatus(item) === "EXACT_DUPLICATE").length,
    [mediaCandidates]
  );

  useEffect(() => {
    if (!websiteImport || (!activeStatuses.has(websiteImport.status) && !mediaIngestionPending)) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadDetails(websiteImport.id).catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [loadDetails, mediaIngestionPending, websiteImport]);

  useEffect(() => {
    if (
      !websiteImport?.importedData ||
      mediaIngestionPending ||
      selectionInitializedFor === websiteImport.id
    ) {
      return;
    }
    setApprovedDataIds(
      new Set(
        websiteImport.importedData
          .filter(
            (item) =>
              item.validationStatus === "APPROVED" ||
              (item.validationStatus === "UNREVIEWED" && !item.critical && !isMediaCandidate(item))
          )
          .map((item) => item.id)
      )
    );
    setMediaDecisions({});
    setSelectionInitializedFor(websiteImport.id);
  }, [mediaIngestionPending, selectionInitializedFor, websiteImport]);

  const unreviewedData = useMemo(
    () =>
      websiteImport?.importedData?.filter(
        (item) => item.validationStatus === "UNREVIEWED" && !isMediaCandidate(item)
      ) ?? [],
    [websiteImport]
  );
  const mediaAwaitingDecision = useMemo(
    () =>
      websiteImport?.mediaAssets?.filter((item) => isIngestedMediaReviewStatus(item.status)) ?? [],
    [websiteImport]
  );
  const undecidedMediaCount = mediaAwaitingDecision.filter(
    (item) => mediaDecisions[item.id] === undefined
  ).length;
  const approvedMediaCount = mediaAwaitingDecision.filter(
    (item) => mediaDecisions[item.id] === "APPROVED"
  ).length;
  const products = useMemo(
    () => websiteImport?.importedData?.filter((item) => item.type === "PRODUCT") ?? [],
    [websiteImport]
  );
  const localData = useMemo(
    () =>
      websiteImport?.importedData?.filter((item) =>
        ["ESTABLISHMENT", "ADDRESS", "PHONE", "BUSINESS_HOURS", "SERVICE"].includes(item.type)
      ) ?? [],
    [websiteImport]
  );
  const priceByProductKey = useMemo(
    () =>
      new Map(
        (websiteImport?.importedData ?? [])
          .filter((item) => item.type === "PRICE")
          .map((item) => [item.key.replace(/:price$/, ""), item])
      ),
    [websiteImport]
  );

  async function startImport() {
    if (!workspace) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          websiteUrl: workspace.websiteUrl
        })
      });
      const payload = (await response.json()) as {
        import?: RealWebsiteImport;
        importId?: string;
        error?: string;
      };
      if (!response.ok || !payload.import) {
        throw new Error(payload.error ?? "Le worker n’a pas accepté l’import.");
      }
      setSelectionInitializedFor(undefined);
      setMediaDecisions({});
      setWebsiteImport(payload.import);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analyse impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleData(id: string) {
    setApprovedDataIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function decideMedia(id: string, decision: ImportMediaDecision) {
    setMediaDecisions((current) => ({ ...current, [id]: decision }));
  }

  async function confirmReview() {
    if (!workspace || !websiteImport) return;
    if (mediaIngestionPending || undecidedMediaCount > 0) {
      setError("Chaque média doit être explicitement conservé ou refusé avant confirmation.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/imports/${websiteImport.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          dataDecisions: unreviewedData.map((item) => ({
            id: item.id,
            decision: approvedDataIds.has(item.id) ? "APPROVED" : "REJECTED"
          })),
          mediaDecisions: mediaAwaitingDecision.map((item) => ({
            id: item.id,
            decision: mediaDecisions[item.id]
          }))
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Validation impossible.");
      await loadDetails(websiteImport.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Validation impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = workspaceLoading || loading;
  const isRunning = websiteImport ? activeStatuses.has(websiteImport.status) : false;
  const validationRequired = unreviewedData.length + undecidedMediaCount;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Source de vérité"
        title="Import réel de yokosushi.fr"
        description="Le crawler sécurisé s’exécute dans le worker Railway. Aucun contenu n’est publié pendant l’import."
        action={
          websiteImport && !isRunning ? (
            <Button variant="secondary" disabled={submitting} onClick={() => void startImport()}>
              <RefreshCw className={cn("size-4", submitting && "animate-spin")} /> Synchroniser
            </Button>
          ) : undefined
        }
      />

      {(workspaceError || error) && (
        <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {workspaceError ?? error}
        </p>
      )}

      {busy && (
        <Card>
          <CardContent className="flex items-center gap-3 p-7 text-sm text-slate-600">
            <LoaderCircle className="size-5 animate-spin text-rose-500" /> Chargement de l’espace
            YokoSushi…
          </CardContent>
        </Card>
      )}

      {!busy && workspace && !websiteImport && (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[1.1fr_.9fr]">
            <CardContent className="p-7 sm:p-9">
              <span className="mb-6 grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                <Globe2 className="size-6" />
              </span>
              <Badge className="mb-3" tone="green">
                Provider réel
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Analyser {workspace.websiteUrl.replace(/^https?:\/\//, "")}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Les pages publiques, endpoints JSON et médias YokoSushi seront analysés. Les prix,
                adresses et téléphones resteront bloqués jusqu’à votre confirmation.
              </p>
              <Button
                className="mt-7"
                size="lg"
                disabled={submitting}
                onClick={() => void startImport()}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Lancer l’analyse réelle
              </Button>
            </CardContent>
            <div className="surface-grid bg-yoko-ink flex min-h-72 items-center justify-center p-8 text-white">
              <div className="space-y-3 text-sm text-slate-200">
                <p>✓ Domaine strictement limité à yokosushi.fr</p>
                <p>✓ Blocage SSRF et IP privées</p>
                <p>✓ Copie locale/S3 des médias</p>
                <p>✓ Validation humaine obligatoire</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!busy && websiteImport && isRunning && (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="p-7 sm:p-9">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-rose-600">
                  {statusLabels[websiteImport.status]}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">www.yokosushi.fr</h2>
              </div>
              <LoaderCircle className="size-6 animate-spin text-rose-500" />
            </div>
            <Progress value={progressFor(websiteImport)} />
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-slate-50 p-3">
                <strong>{websiteImport.pagesScanned}</strong>
                <span className="mt-1 block text-xs text-slate-500">pages</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <strong>{websiteImport.productsDetected}</strong>
                <span className="mt-1 block text-xs text-slate-500">produits</span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <strong>{websiteImport.imagesDetected}</strong>
                <span className="mt-1 block text-xs text-slate-500">images</span>
              </div>
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Vous pouvez quitter cette page : le worker poursuit l’analyse et le résultat est
              conservé en base.
            </p>
          </CardContent>
        </Card>
      )}

      {!busy && websiteImport && !isRunning && (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-full",
                      websiteImport.status === "FAILED"
                        ? "bg-red-50 text-red-600"
                        : "bg-emerald-50 text-emerald-600"
                    )}
                  >
                    {websiteImport.status === "FAILED" ? (
                      <AlertTriangle className="size-5" />
                    ) : (
                      <CheckCircle2 className="size-5" />
                    )}
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-950">
                      {statusLabels[websiteImport.status]}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Données récupérées par le provider réel
                    </p>
                  </div>
                </div>
                {validationRequired > 0 && (
                  <Badge tone="amber">{validationRequired} éléments à décider</Badge>
                )}
              </div>
              {websiteImport.errorMessage && (
                <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {websiteImport.errorMessage}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  ["Pages", websiteImport.pagesScanned],
                  ["Établissements", websiteImport.brand.establishments?.length ?? 0],
                  ["Produits", websiteImport.productsDetected],
                  ["Images", websiteImport.imagesDetected],
                  [
                    ["COMPLETED", "PARTIALLY_COMPLETED"].includes(websiteImport.status)
                      ? "Conservées"
                      : "Copies prêtes",
                    websiteImport.imagesImported
                  ],
                  ["Erreurs", websiteImport.errorsCount]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xl font-semibold text-slate-950">{value}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {failedMediaCandidates.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {failedMediaCandidates.length} média(s) n’ont pas pu être copiés
                  </p>
                  <p className="mt-1 text-xs leading-5 text-red-700">
                    Ces éléments sont dans un état terminal et ne seront pas importés. Vous pouvez
                    décider les autres médias puis terminer l’import partiel.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {failedMediaCandidates.slice(0, 5).map((item) => (
                      <li key={item.id} className="truncate">
                        {mediaIngestionStatus(item) === "MISSING"
                          ? "Job média introuvable"
                          : "Copie en échec"}{" "}
                        · {sourceLabel(mediaCandidateSource(item))}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {duplicateMediaCandidates > 0 && (
            <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              {duplicateMediaCandidates} doublon(s) exact(s) déjà présents dans la médiathèque n’ont
              pas été copiés une seconde fois.
            </p>
          )}

          {websiteImport.status !== "FAILED" && (
            <Card>
              <div className="flex overflow-x-auto border-b border-slate-200 px-3">
                {(
                  [
                    ["establishments", "Établissements", Store],
                    ["products", "Produits et prix", PackageOpen],
                    ["media", "Photos", ImageIcon]
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 border-b-2 px-4 py-4 text-sm font-semibold",
                      tab === id
                        ? "border-rose-500 text-rose-600"
                        : "border-transparent text-slate-500"
                    )}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>
              <CardContent className="p-5 sm:p-6">
                {tab === "establishments" && (
                  <div className="space-y-3">
                    {localData.map((item) => (
                      <label
                        key={item.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-4",
                          approvedDataIds.has(item.id)
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-amber-200 bg-amber-50/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={approvedDataIds.has(item.id)}
                          disabled={item.validationStatus !== "UNREVIEWED"}
                          onChange={() => toggleData(item.id)}
                          className="mt-1 accent-emerald-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm text-slate-900">
                              {item.type === "ESTABLISHMENT"
                                ? item.normalizedValue
                                : displayValue(item.value)}
                            </strong>
                            {item.critical && <Badge tone="amber">Critique</Badge>}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            Confiance {Math.round(item.confidence * 100)} % ·{" "}
                            {sourceLabel(item.sourceUrl)}
                          </span>
                        </span>
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Ouvrir la source"
                        >
                          <ExternalLink className="size-4 text-slate-400" />
                        </a>
                      </label>
                    ))}
                    {localData.length === 0 && (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                        Aucune information locale détectée.
                      </p>
                    )}
                  </div>
                )}

                {tab === "products" && (
                  <div className="space-y-3">
                    {products.map((product) => {
                      const price = priceByProductKey.get(product.key);
                      return (
                        <div key={product.id} className="rounded-xl border border-slate-200 p-4">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={approvedDataIds.has(product.id)}
                              disabled={product.validationStatus !== "UNREVIEWED"}
                              onChange={() => toggleData(product.id)}
                              className="mt-1 accent-rose-500"
                            />
                            <span className="min-w-0 flex-1">
                              <strong className="text-slate-900">{product.normalizedValue}</strong>
                              <span className="mt-1 block text-xs text-slate-500">
                                Source : {sourceLabel(product.sourceUrl)}
                              </span>
                            </span>
                          </label>
                          {price && (
                            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                              <input
                                type="checkbox"
                                checked={approvedDataIds.has(price.id)}
                                disabled={price.validationStatus !== "UNREVIEWED"}
                                onChange={() => toggleData(price.id)}
                                className="accent-emerald-600"
                              />
                              Confirmer explicitement le prix détecté :{" "}
                              <strong>{displayValue(price.value)}</strong>
                            </label>
                          )}
                        </div>
                      );
                    })}
                    {products.length === 0 && (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                        Aucun produit détecté.
                      </p>
                    )}
                  </div>
                )}

                {tab === "media" && (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {(websiteImport.mediaAssets ?? []).map((media) => (
                      <div
                        key={media.id}
                        className={cn(
                          "overflow-hidden rounded-2xl border",
                          mediaDecisions[media.id] === "APPROVED" &&
                            "border-emerald-400 ring-2 ring-emerald-100",
                          mediaDecisions[media.id] === "REJECTED" && "border-red-300 bg-red-50/30",
                          mediaDecisions[media.id] === undefined && "border-slate-200"
                        )}
                      >
                        <div className="relative aspect-[4/3] bg-slate-100">
                          {media.publicUrl ? (
                            <img
                              src={media.publicUrl}
                              alt={media.detectedTitle ?? media.originalName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-xs text-slate-400">
                              Copie média indisponible
                            </div>
                          )}
                          <Badge
                            className="absolute top-3 right-3"
                            tone={media.qualityScore >= 65 ? "green" : "amber"}
                          >
                            {media.qualityScore}/100
                          </Badge>
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-semibold">
                            {media.detectedTitle ?? media.originalName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {media.width ?? "?"} × {media.height ?? "?"} · {media.editorialCategory}
                          </p>
                          {isIngestedMediaReviewStatus(media.status) ? (
                            <>
                              <p className="mt-2 text-[11px] font-medium text-slate-500">
                                {automaticMediaStatusLabel(media.status)} — décision humaine requise
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  aria-pressed={mediaDecisions[media.id] === "APPROVED"}
                                  className={cn(
                                    mediaDecisions[media.id] === "APPROVED" &&
                                      "bg-emerald-600 text-white ring-emerald-600 hover:bg-emerald-700"
                                  )}
                                  onClick={() => decideMedia(media.id, "APPROVED")}
                                >
                                  <CheckCircle2 className="size-4" /> Conserver
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="danger"
                                  aria-pressed={mediaDecisions[media.id] === "REJECTED"}
                                  className={cn(
                                    mediaDecisions[media.id] === "REJECTED" &&
                                      "bg-red-600 text-white ring-red-600 hover:bg-red-700"
                                  )}
                                  onClick={() => decideMedia(media.id, "REJECTED")}
                                >
                                  <XCircle className="size-4" /> Refuser
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p className="mt-2 text-[11px] font-medium text-slate-500">
                              Décision enregistrée : {media.status}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {(websiteImport.mediaAssets ?? []).length === 0 && (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                        Les médias détectés sont encore en cours de copie ou aucun média éditorial
                        n’a été retenu.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {websiteImport.status === "WAITING_FOR_REVIEW" && (
            <div className="bg-yoko-ink flex flex-col items-start justify-between gap-4 rounded-2xl p-5 text-white sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold">
                  {mediaIngestionPending
                    ? "Les copies des médias sont encore en cours"
                    : undecidedMediaCount > 0
                      ? `${undecidedMediaCount} média(s) attendent votre décision explicite`
                      : `${approvedDataIds.size} données et ${approvedMediaCount} médias seront conservés`}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {mediaIngestionPending
                    ? "Le worker télécharge et contrôle chaque image avant de permettre la validation."
                    : undecidedMediaCount > 0
                      ? "Choisissez Conserver ou Refuser sur chaque photo. Le score automatique ne vaut jamais validation."
                      : "Chaque média a reçu une décision humaine ; les refus restent tracés."}
                </p>
              </div>
              <Button
                disabled={submitting || mediaIngestionPending || undecidedMediaCount > 0}
                onClick={() => void confirmReview()}
              >
                {submitting || mediaIngestionPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}{" "}
                Confirmer la sélection
              </Button>
            </div>
          )}

          {["COMPLETED", "PARTIALLY_COMPLETED"].includes(websiteImport.status) && (
            <div className="flex justify-end">
              <Button asChild>
                <Link href="/media">Ouvrir la médiathèque</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
