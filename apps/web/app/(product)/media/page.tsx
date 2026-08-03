"use client";

import { demoMedia } from "@yokosocial/shared";
import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import { Archive, Filter, ImageIcon, Search, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { RealMediaPage } from "@/components/media/real-media-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

type MediaFilter = "all" | "best" | "unused" | "review";

function DemoMediaPage() {
  const { state } = useDemo();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const available = state.import.confirmed
    ? demoMedia.filter((media) => state.import.selectedMediaIds.includes(media.id))
    : [];
  const filtered = useMemo(
    () =>
      available.filter((media) => {
        const matchesQuery = `${media.title} ${media.editorialCategory}`
          .toLocaleLowerCase("fr")
          .includes(query.toLocaleLowerCase("fr"));
        const matchesFilter =
          filter === "all" ||
          (filter === "best" && media.qualityScore >= 88 && media.status === "APPROVED") ||
          (filter === "unused" && media.usageCount === 0) ||
          (filter === "review" && media.status === "NEEDS_REVIEW");
        return matchesQuery && matchesFilter;
      }),
    [available, filter, query]
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Bibliothèque visuelle"
        title="Médiathèque"
        description="Les originaux sont immuables. Les recadrages et améliorations deviennent des variantes séparées."
        action={
          <Button variant="secondary">
            <Upload className="size-4" /> Ajouter un média
          </Button>
        }
      />

      {!state.import.confirmed ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ImageIcon className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">La médiathèque est vide</h2>
            <p className="mt-2 text-sm text-slate-500">
              Confirmez d’abord la sélection issue de l’import.
            </p>
            <Button asChild className="mt-6">
              <Link href="/import">Ouvrir l’import du site</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
              <label className="relative flex-1">
                <Search className="absolute top-3 left-3.5 size-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher un produit, une catégorie…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-4 pl-10 text-sm outline-none focus:border-rose-400 focus:bg-white"
                />
              </label>
              <div className="flex gap-2 overflow-x-auto">
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
                    onClick={() => setFilter(id)}
                    className={cn(
                      "flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold ring-1 transition",
                      filter === id
                        ? "bg-yoko-ink ring-yoko-ink text-white"
                        : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selected.length > 0 && (
            <div className="bg-yoko-ink mb-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm text-white">
              <span>{selected.length} média(s) sélectionné(s)</span>
              <Button size="sm" variant="secondary" onClick={() => setSelected([])}>
                Annuler la sélection
              </Button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((media) => {
              const checked = selected.includes(media.id);
              return (
                <article
                  key={media.id}
                  className={cn(
                    "group overflow-hidden rounded-2xl border bg-white transition hover:-translate-y-0.5 hover:shadow-lg",
                    checked ? "border-rose-400 ring-2 ring-rose-100" : "border-slate-200"
                  )}
                >
                  <button
                    className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left"
                    onClick={() =>
                      setSelected((current) =>
                        checked ? current.filter((id) => id !== media.id) : [...current, media.id]
                      )
                    }
                  >
                    <img
                      src={media.src}
                      alt={media.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
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
                      tone={media.qualityScore >= 88 ? "green" : "amber"}
                    >
                      {media.qualityScore}/100
                    </Badge>
                    <span className="absolute right-3 bottom-3 rounded-md bg-slate-950/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
                      DÉMO
                    </span>
                  </button>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-slate-900">
                          {media.title}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          {media.width} × {media.height} · {media.editorialCategory}
                        </p>
                      </div>
                      <Badge>{media.category}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                      <span>{media.usageCount} utilisation</span>
                      <span>{media.status === "APPROVED" ? "Approuvée" : "À vérifier"}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-500">
                Aucun média ne correspond à ce filtre.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}

export default function MediaPage() {
  return isPublicDemoMode() ? <DemoMediaPage /> : <RealMediaPage />;
}
