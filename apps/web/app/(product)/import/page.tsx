"use client";

import { demoEstablishments, demoMedia, demoProducts } from "@yokosocial/shared";
import { Badge, Button, Card, CardContent, Progress, cn } from "@yokosocial/ui";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Globe2,
  ImageIcon,
  PackageOpen,
  RefreshCw,
  Search,
  Store
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { RealImportPage } from "@/components/import/real-import-page";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { isPublicDemoMode } from "@/lib/demo-mode";
import type { ImportStep } from "@/lib/demo-state";

const stepLabels: Array<{ id: ImportStep; label: string }> = [
  { id: "connecting", label: "Connexion au site" },
  { id: "pages", label: "Analyse des pages" },
  { id: "establishments", label: "Détection des restaurants" },
  { id: "products", label: "Détection des produits" },
  { id: "images", label: "Détection des images" },
  { id: "quality", label: "Analyse de la qualité" },
  { id: "duplicates", label: "Recherche des doublons" },
  { id: "preview", label: "Préparation de l’aperçu" }
];

const stepOrder = stepLabels.map((step) => step.id);

function DemoImportPage() {
  const { state, startImport, toggleProduct, toggleMedia, confirmImport } = useDemo();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<"establishments" | "products" | "media">("establishments");

  async function runImport() {
    setError(undefined);
    try {
      await startImport();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import impossible.");
    }
  }

  const currentStepIndex = stepOrder.indexOf(state.import.step);
  const summary = state.import.summary;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Source de vérité"
        title="Import du site"
        description="Analyse limitée à yokosushi.fr. Les liens externes sont enregistrés mais jamais explorés."
        action={
          summary ? (
            <Button
              onClick={() => void runImport()}
              variant="secondary"
              disabled={state.import.running}
            >
              <RefreshCw className={cn("size-4", state.import.running && "animate-spin")} />
              Synchroniser
            </Button>
          ) : undefined
        }
      />

      {!summary && !state.import.running && (
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[1.1fr_.9fr]">
            <CardContent className="p-7 sm:p-9">
              <span className="mb-6 grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                <Globe2 className="size-6" />
              </span>
              <Badge className="mb-3" tone="rose">
                Import protégé
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Importer les contenus depuis www.yokosushi.fr
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                Le parcours présenté est une simulation hors ligne clairement identifiée. Le worker
                réel utilise les pages publiques et les endpoints JSON observés, avec validation
                SSRF.
              </p>
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Les adresses, téléphones, horaires, prix et promotions détectés restent en
                    attente d’une confirmation humaine.
                  </span>
                </div>
              </div>
              {error && (
                <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
              )}
              <Button className="mt-7" size="lg" onClick={() => void runImport()}>
                <Search className="size-4" /> Lancer l’analyse de démonstration
              </Button>
            </CardContent>
            <div className="surface-grid bg-yoko-ink flex min-h-72 items-center justify-center p-8 text-white">
              <div className="w-full max-w-xs space-y-3">
                {[
                  "HTML & données structurées",
                  "Carte JSON dynamique",
                  "Médias et doublons",
                  "Contrôles qualité"
                ].map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-xl bg-white/[.07] p-3 ring-1 ring-white/10"
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-rose-400/20 text-xs font-bold text-rose-200">
                      {index + 1}
                    </span>
                    <span className="text-sm text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {state.import.running && (
        <Card className="mx-auto max-w-3xl">
          <CardContent className="p-7 sm:p-9">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-rose-600">Analyse en cours</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">www.yokosushi.fr</h2>
              </div>
              <span className="text-2xl font-semibold text-slate-900 tabular-nums">
                {state.import.progress}%
              </span>
            </div>
            <Progress value={state.import.progress} />
            <div className="mt-7 grid gap-2 sm:grid-cols-2">
              {stepLabels.map((step, index) => {
                const completed = currentStepIndex > index;
                const active = currentStepIndex === index;
                return (
                  <div
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                      active ? "bg-rose-50 font-semibold text-rose-700" : "text-slate-500"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full",
                        completed
                          ? "bg-emerald-100 text-emerald-700"
                          : active
                            ? "bg-rose-100 text-rose-600"
                            : "bg-slate-100 text-slate-400"
                      )}
                    >
                      {completed ? (
                        <Check className="size-3.5" />
                      ) : active ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {step.label}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && !state.import.running && (
        <div className="space-y-5">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-950">Aperçu prêt à vérifier</h2>
                    <p className="text-xs text-slate-500">
                      Résultats fictifs du provider de démonstration
                    </p>
                  </div>
                </div>
                <Badge tone="amber">{summary.validationRequired} informations à valider</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {[
                  ["Pages", summary.pagesScanned],
                  ["Établissements", summary.establishmentsDetected],
                  ["Produits", summary.productsDetected],
                  ["Images", summary.imagesDetected],
                  ["Retenues", summary.imagesRetained],
                  ["Doublons", summary.duplicatesDetected]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xl font-semibold text-slate-950">{value}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <div className="flex overflow-x-auto border-b border-slate-200 px-3">
              {(
                [
                  ["establishments", "Établissements", Store],
                  ["products", "Produits", PackageOpen],
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
                <div className="grid gap-4 lg:grid-cols-2">
                  {demoEstablishments.map((establishment) => (
                    <div
                      key={establishment.id}
                      className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-950">{establishment.name}</h3>
                          <p className="mt-1 text-sm text-slate-600">{establishment.city}</p>
                        </div>
                        <Badge tone="amber">À valider</Badge>
                      </div>
                      <dl className="mt-4 space-y-2 text-sm">
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">Adresse</dt>
                          <dd>{establishment.address}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-slate-500">Téléphone</dt>
                          <dd>{establishment.phone}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
              {tab === "products" && (
                <div className="space-y-3">
                  {demoProducts.map((product) => {
                    const selected = state.import.selectedProductIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-4",
                          selected ? "border-rose-200 bg-rose-50/40" : "border-slate-200"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProduct(product.id)}
                          className="mt-1 accent-rose-500"
                        />
                        <span className="flex-1">
                          <span className="font-semibold text-slate-900">{product.name}</span>
                          <span className="mt-1 block text-sm text-slate-500">
                            {product.description}
                          </span>
                        </span>
                        <Badge>{product.category}</Badge>
                      </label>
                    );
                  })}
                </div>
              )}
              {tab === "media" && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {demoMedia.map((media) => {
                    const selected = state.import.selectedMediaIds.includes(media.id);
                    return (
                      <label
                        key={media.id}
                        className={cn(
                          "group cursor-pointer overflow-hidden rounded-2xl border",
                          selected ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-200"
                        )}
                      >
                        <div className="relative aspect-[4/3] bg-slate-100">
                          <img
                            src={media.src}
                            alt={media.title}
                            className="h-full w-full object-cover"
                          />
                          <input
                            aria-label={`Sélectionner ${media.title}`}
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleMedia(media.id)}
                            className="absolute top-3 left-3 size-5 accent-rose-500"
                          />
                          <Badge
                            className="absolute top-3 right-3"
                            tone={media.status === "APPROVED" ? "green" : "amber"}
                          >
                            {media.qualityScore}/100
                          </Badge>
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-semibold">{media.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {media.width} × {media.height} · {media.editorialCategory}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="bg-yoko-ink flex flex-col items-start justify-between gap-4 rounded-2xl p-5 text-white sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold">
                {state.import.selectedProductIds.length} produits et{" "}
                {state.import.selectedMediaIds.length} médias sélectionnés
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Aucune publication n’est créée pendant l’import.
              </p>
            </div>
            {state.import.confirmed ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary">
                  <Link href="/media">
                    Voir la médiathèque <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/posts">
                    Générer les publications <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <Button onClick={confirmImport}>
                <Check className="size-4" /> Confirmer l’import
              </Button>
            )}
          </div>
          <a
            href="https://www.yokosushi.fr"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
          >
            Ouvrir la source officielle <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </AppShell>
  );
}

export default function ImportPage() {
  return isPublicDemoMode() ? <DemoImportPage /> : <RealImportPage />;
}
