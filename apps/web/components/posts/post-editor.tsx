"use client";

import { demoEstablishments, demoMedia, type Platform } from "@yokosocial/shared";
import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Instagram,
  RefreshCw,
  Send,
  X
} from "lucide-react";
import { useMemo, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import type { DemoPost } from "@/lib/demo-state";

const statusLabels = {
  DRAFT: ["Brouillon", "slate"],
  PENDING_REVIEW: ["À valider", "amber"],
  APPROVED: ["Approuvée", "green"],
  SCHEDULED: ["Programmée", "blue"],
  PUBLISHING: ["Publication…", "blue"],
  PUBLISHED: ["Publiée", "green"],
  REJECTED: ["Refusée", "rose"],
  FAILED: ["En erreur", "rose"],
  CANCELLED: ["Annulée", "slate"]
} as const;

function PlatformPreview({ post, platform }: { post: DemoPost; platform: Platform }) {
  const [slide, setSlide] = useState(0);
  const media = post.mediaAssetIds
    .map((id) => demoMedia.find((item) => item.id === id))
    .filter(Boolean);
  const activeMedia = media[slide] ?? media[0];
  const caption = platform === "instagram" ? post.instagramCaption : post.facebookCaption;

  return (
    <div
      className={cn(
        "mx-auto overflow-hidden bg-white shadow-xl shadow-slate-900/10",
        platform === "instagram"
          ? "max-w-[390px] rounded-[28px] border-[6px] border-slate-950"
          : "max-w-[520px] rounded-2xl border border-slate-200"
      )}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className="bg-yoko-ink grid size-8 place-items-center rounded-full text-[9px] font-bold text-white">
          YS
        </span>
        <div>
          <p className="text-xs font-semibold">yokosushi_demo</p>
          <p className="text-[10px] text-slate-500">Contenu de démonstration</p>
        </div>
        <span className="ml-auto text-slate-400">•••</span>
      </div>
      {activeMedia ? (
        <div
          className={cn(
            "relative bg-slate-100",
            post.format === "story" ? "aspect-[9/16]" : "aspect-square"
          )}
        >
          <img
            src={activeMedia.src}
            alt={activeMedia.title}
            className="h-full w-full object-cover"
          />
          {media.length > 1 && (
            <>
              <button
                onClick={() => setSlide((current) => Math.max(0, current - 1))}
                className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow"
                aria-label="Slide précédente"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setSlide((current) => Math.min(media.length - 1, current + 1))}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 shadow"
                aria-label="Slide suivante"
              >
                <ChevronRight className="size-4" />
              </button>
              <span className="absolute top-3 right-3 rounded-full bg-slate-950/70 px-2 py-1 text-[10px] text-white">
                {slide + 1}/{media.length}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="grid aspect-square place-items-center bg-slate-100 text-xs text-slate-400">
          Aucun média
        </div>
      )}
      <div className="p-4">
        <div className="mb-3 flex gap-3">
          {platform === "instagram" ? (
            <Instagram className="size-5" />
          ) : (
            <Facebook className="size-5 text-blue-600" />
          )}
          <span className="text-sm">♡</span>
          <span className="text-sm">⌁</span>
        </div>
        <p className="text-xs leading-5 whitespace-pre-wrap text-slate-700">
          <strong>yokosushi_demo</strong> {caption}
        </p>
        {post.hashtags.length > 0 && (
          <p className="mt-2 text-xs leading-5 text-blue-700">{post.hashtags.join(" ")}</p>
        )}
      </div>
    </div>
  );
}

export function PostEditor({ post }: { post: DemoPost }) {
  const { updatePost, transitionPost, schedulePost } = useDemo();
  const [preview, setPreview] = useState<Platform>(post.platforms[0] ?? "instagram");
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string>();
  const status = statusLabels[post.status];
  const displayDate = useMemo(
    () => (post.scheduledAt ?? post.suggestedAt ?? new Date().toISOString()).slice(0, 16),
    [post.scheduledAt, post.suggestedAt]
  );

  function togglePlatform(platform: Platform) {
    const exists = post.platforms.includes(platform);
    const next = exists
      ? post.platforms.filter((item) => item !== platform)
      : [...post.platforms, platform];
    if (next.length > 0) updatePost(post.id, { platforms: next });
  }

  async function schedule(scenario: "success" | "error") {
    setScheduling(true);
    setError(undefined);
    try {
      await schedulePost(post.id, scenario);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Programmation impossible.");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(390px,.82fr)]">
      <Card>
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-wider text-rose-600 uppercase">Édition</p>
              <h2 className="mt-1 text-xl font-semibold">{post.title}</h2>
            </div>
            <Badge tone={status[1]}>{status[0]}</Badge>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Plateformes</p>
            <div className="flex gap-2">
              {(["instagram", "facebook"] as const).map((platform) => {
                const selected = post.platforms.includes(platform);
                const Icon = platform === "instagram" ? Instagram : Facebook;
                return (
                  <button
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                      selected
                        ? "bg-yoko-ink ring-yoko-ink text-white"
                        : "bg-white text-slate-600 ring-slate-200"
                    )}
                  >
                    <Icon className="size-4" />
                    {platform === "instagram" ? "Instagram" : "Facebook"}
                    {selected && <Check className="size-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-sm font-semibold text-slate-700">
            Établissements
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {demoEstablishments.map((establishment) => {
                const selected = post.establishmentIds.includes(establishment.id);
                return (
                  <button
                    type="button"
                    key={establishment.id}
                    onClick={() => {
                      const next = selected
                        ? post.establishmentIds.filter((id) => id !== establishment.id)
                        : [...post.establishmentIds, establishment.id];
                      if (next.length > 0) updatePost(post.id, { establishmentIds: next });
                    }}
                    className={cn(
                      "rounded-xl border p-3 text-left text-xs",
                      selected
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : "border-slate-200 text-slate-600"
                    )}
                  >
                    <span className="font-semibold">{establishment.name}</span>
                    <span className="mt-1 block opacity-70">{establishment.city}</span>
                  </button>
                );
              })}
            </div>
          </label>

          {post.platforms.includes("instagram") && (
            <label className="block text-sm font-semibold text-slate-700">
              Légende Instagram
              <textarea
                value={post.instagramCaption ?? ""}
                onChange={(event) => updatePost(post.id, { instagramCaption: event.target.value })}
                rows={6}
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-4 leading-6 font-normal outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-50"
              />
              <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">
                {post.instagramCaption?.length ?? 0} / 2 200
              </span>
            </label>
          )}
          {post.platforms.includes("facebook") && (
            <label className="block text-sm font-semibold text-slate-700">
              Texte Facebook
              <textarea
                value={post.facebookCaption ?? ""}
                onChange={(event) => updatePost(post.id, { facebookCaption: event.target.value })}
                rows={6}
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-4 leading-6 font-normal outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-50"
              />
              <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">
                {post.facebookCaption?.length ?? 0} / 5 000
              </span>
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Appel à l’action
              <input
                value={post.callToAction}
                onChange={(event) => updatePost(post.id, { callToAction: event.target.value })}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-rose-400"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Date et heure
              <input
                type="datetime-local"
                value={displayDate}
                onChange={(event) =>
                  updatePost(post.id, { scheduledAt: new Date(event.target.value).toISOString() })
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-rose-400"
              />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Hashtags
            <input
              value={post.hashtags.join(" ")}
              onChange={(event) =>
                updatePost(post.id, {
                  hashtags: event.target.value.split(/\s+/).filter((tag) => tag.startsWith("#"))
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal outline-none focus:border-rose-400"
            />
          </label>

          {post.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              {post.warnings.map((warning) => (
                <p key={warning} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {post.providerMessage && (
            <p
              className={cn(
                "rounded-xl p-3 text-sm",
                post.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
              )}
            >
              {post.providerMessage}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {post.status === "DRAFT" && (
              <Button onClick={() => transitionPost(post.id, "PENDING_REVIEW")}>
                <Send className="size-4" /> Envoyer en validation
              </Button>
            )}
            {post.status === "PENDING_REVIEW" && (
              <>
                <Button onClick={() => transitionPost(post.id, "APPROVED")}>
                  <Check className="size-4" /> Approuver
                </Button>
                <Button variant="danger" onClick={() => transitionPost(post.id, "REJECTED")}>
                  <X className="size-4" /> Refuser
                </Button>
              </>
            )}
            {post.status === "REJECTED" && (
              <Button onClick={() => transitionPost(post.id, "DRAFT")}>
                <RefreshCw className="size-4" /> Reprendre le brouillon
              </Button>
            )}
            {post.status === "APPROVED" && (
              <>
                <Button disabled={scheduling} onClick={() => void schedule("success")}>
                  <CalendarClock className="size-4" />{" "}
                  {scheduling ? "Programmation…" : "Programmer avec Postiz mock"}
                </Button>
                <Button
                  disabled={scheduling}
                  variant="danger"
                  onClick={() => void schedule("error")}
                >
                  Simuler une erreur
                </Button>
              </>
            )}
            {(post.status === "SCHEDULED" || post.status === "FAILED") && (
              <Badge tone={post.status === "SCHEDULED" ? "blue" : "rose"}>
                {post.status === "SCHEDULED" ? "Suivi Postiz actif" : "Tentative enregistrée"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit bg-slate-100/70">
        <CardContent className="p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Aperçu mobile</p>
            <div className="flex rounded-lg bg-white p-1 ring-1 ring-slate-200">
              {post.platforms.map((platform) => (
                <button
                  key={platform}
                  onClick={() => setPreview(platform)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold",
                    preview === platform ? "bg-yoko-ink text-white" : "text-slate-500"
                  )}
                >
                  {platform === "instagram" ? "Instagram" : "Facebook"}
                </button>
              ))}
            </div>
          </div>
          <PlatformPreview
            post={post}
            platform={
              post.platforms.includes(preview) ? preview : (post.platforms[0] ?? "instagram")
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
