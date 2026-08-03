"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  mediaUrl,
  requestJson,
  type RealPost,
  type RealPostStatus
} from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import { pollingIntervalLabel, publicationPollingInterval } from "@/lib/publication-polling";

const statusLabels: Record<RealPostStatus, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "À valider",
  APPROVED: "Approuvée",
  SCHEDULED: "Programmée",
  PUBLISHING: "Publication",
  PUBLISHED: "Publiée",
  REJECTED: "Refusée",
  FAILED: "Erreur",
  CANCELLED: "Annulée"
};

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function statusTone(status: RealPostStatus): "slate" | "green" | "amber" | "rose" | "blue" {
  if (["APPROVED", "PUBLISHED"].includes(status)) return "green";
  if (["PENDING_REVIEW", "PUBLISHING"].includes(status)) return "amber";
  if (["FAILED", "REJECTED", "CANCELLED"].includes(status)) return "rose";
  if (status === "SCHEDULED") return "blue";
  return "slate";
}

export function RealCalendarPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [posts, setPosts] = useState<RealPost[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const loadPosts = useCallback(
    async (silent = false) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      if (!silent) setError(undefined);
      try {
        const query = new URLSearchParams({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId
        });
        const payload = await requestJson<{ posts: RealPost[] }>(`/api/posts?${query}`);
        setPosts(payload.posts);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement du calendrier impossible.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workspace]
  );

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const publicationPollInterval = publicationPollingInterval(posts);

  useEffect(() => {
    if (!publicationPollInterval) return;
    const interval = window.setInterval(() => void loadPosts(true), publicationPollInterval);
    return () => window.clearInterval(interval);
  }, [loadPosts, publicationPollInterval]);

  const start = useMemo(() => {
    const date = startOfWeek(new Date());
    date.setDate(date.getDate() + weekOffset * 7);
    return date;
  }, [weekOffset]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(date.getDate() + index);
        return date;
      }),
    [start]
  );
  const datedPosts = posts.filter((post) => Boolean(post.scheduledAt));
  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Planning éditorial · données réelles"
        title="Calendrier"
        description="Dates saisies dans votre fuseau local, enregistrées en UTC. Les statuts de programmation sont rafraîchis pendant le traitement du worker."
        action={
          <Button asChild>
            <Link href="/posts">
              <Plus className="size-4" /> Préparer une publication
            </Link>
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone="green">Calendrier réel · {workspace?.brandName ?? "YokoSushi"}</Badge>
        {publicationPollInterval && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <RefreshCw className="size-3.5 animate-spin" /> Synchronisation toutes les{" "}
            {pollingIntervalLabel(publicationPollInterval)}
          </span>
        )}
      </div>

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadPosts())}
          >
            Réessayer
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Semaine précédente"
              onClick={() => setWeekOffset((current) => current - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="min-w-52 rounded-xl px-3 py-2 text-center text-sm font-semibold hover:bg-slate-50"
            >
              Semaine du{" "}
              {start.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Semaine suivante"
              onClick={() => setWeekOffset((current) => current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="amber">
              À valider {posts.filter((post) => post.status === "PENDING_REVIEW").length}
            </Badge>
            <Badge tone="blue">
              Programmées {posts.filter((post) => post.status === "SCHEDULED").length}
            </Badge>
            <Badge tone="green">
              Publiées {posts.filter((post) => post.status === "PUBLISHED").length}
            </Badge>
          </div>
        </div>
        <CardContent className="overflow-x-auto p-0">
          {busy ? (
            <div className="flex min-h-96 items-center justify-center gap-3 text-sm text-slate-500">
              <LoaderCircle className="size-5 animate-spin" /> Chargement des publications réelles…
            </div>
          ) : (
            <div className="grid min-w-[980px] grid-cols-7 divide-x divide-slate-100">
              {days.map((day) => {
                const dayPosts = datedPosts.filter((post) =>
                  sameDay(new Date(post.scheduledAt ?? 0), day)
                );
                const today = sameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className="min-h-[520px] bg-white">
                    <div
                      className={`border-b border-slate-100 p-3 text-center ${today ? "bg-rose-50" : ""}`}
                    >
                      <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                        {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                      </p>
                      <p
                        className={`mx-auto mt-1 grid size-8 place-items-center rounded-full text-sm font-semibold ${today ? "bg-rose-500 text-white" : "text-slate-800"}`}
                      >
                        {day.getDate()}
                      </p>
                    </div>
                    <div className="space-y-2 p-2">
                      {dayPosts.map((post) => {
                        const thumbnail = post.media[0] ? mediaUrl(post.media[0]) : null;
                        return (
                          <Link
                            key={post.id}
                            href="/posts"
                            className="block overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            {thumbnail && (
                              <div className="aspect-[16/9] overflow-hidden bg-slate-100">
                                <img
                                  src={thumbnail}
                                  alt={post.media[0]?.mediaAsset.altText ?? post.title}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            <div className="p-3">
                              <div className="mb-2 flex items-center justify-between gap-1">
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                  <Clock3 className="size-3" />
                                  {new Date(post.scheduledAt ?? 0).toLocaleTimeString("fr-FR", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </span>
                                <Badge
                                  tone={statusTone(post.status)}
                                  className="px-1.5 py-0.5 text-[9px]"
                                >
                                  {statusLabels[post.status]}
                                </Badge>
                              </div>
                              <p className="line-clamp-3 text-xs leading-4 font-semibold text-slate-900">
                                {post.title}
                              </p>
                              <p className="mt-2 text-[9px] text-slate-500">
                                {post.platforms.join(" + ")}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                      {dayPosts.length === 0 && (
                        <div className="mt-12 text-center text-[11px] text-slate-300">
                          Aucune publication
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!busy && datedPosts.length === 0 && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          <CalendarDays className="size-5" />
          Aucune publication réelle n’a encore de date. Ajoutez une date, soumettez-la, approuvez-la
          puis programmez-la.
        </div>
      )}
    </AppShell>
  );
}
