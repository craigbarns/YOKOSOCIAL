"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import Link from "next/link";

import { useDemo } from "@/components/demo/demo-provider";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { RealCalendarPage } from "@/components/calendar/real-calendar-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function DemoCalendarPage() {
  const { state } = useDemo();
  const start = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date;
  });
  const scheduled = state.posts.filter((post) => post.status === "SCHEDULED");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Planning éditorial"
        title="Calendrier"
        description="Toutes les dates sont affichées dans le fuseau Europe/Paris et stockées en UTC."
        action={
          <Button asChild>
            <Link href="/posts">
              <Plus className="size-4" /> Nouvelle publication
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" aria-label="Semaine précédente">
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="min-w-48 text-center text-sm font-semibold">
              Semaine du{" "}
              {start.toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}
            </h2>
            <Button size="icon" variant="ghost" aria-label="Semaine suivante">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Badge tone="amber">
              Brouillons {state.posts.filter((post) => post.status === "DRAFT").length}
            </Badge>
            <Badge tone="blue">Programmées {scheduled.length}</Badge>
          </div>
        </div>
        <CardContent className="overflow-x-auto p-0">
          <div className="grid min-w-[900px] grid-cols-7 divide-x divide-slate-100">
            {days.map((day) => {
              const dayPosts = scheduled.filter((post) => {
                const date = new Date(post.scheduledAt ?? post.suggestedAt ?? 0);
                return date.toDateString() === day.toDateString();
              });
              const today = day.toDateString() === new Date().toDateString();
              return (
                <div key={day.toISOString()} className="min-h-[470px] bg-white">
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
                    {dayPosts.map((post) => (
                      <div
                        key={post.id}
                        className="rounded-xl border border-blue-200 bg-blue-50 p-3"
                      >
                        <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold text-blue-700">
                          <Clock3 className="size-3" />
                          {new Date(post.scheduledAt ?? "").toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </div>
                        <p className="text-xs leading-4 font-semibold text-slate-900">
                          {post.title}
                        </p>
                        <p className="mt-2 text-[10px] text-slate-500">
                          {post.platforms.join(" + ")}
                        </p>
                      </div>
                    ))}
                    {dayPosts.length === 0 && (
                      <div className="mt-10 text-center text-[11px] text-slate-300">
                        Aucune publication
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {scheduled.length === 0 && (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          <CalendarDays className="size-5" />
          Approuvez puis programmez une proposition pour la voir ici.
        </div>
      )}
    </AppShell>
  );
}

export default function CalendarPage() {
  return isPublicDemoMode() ? <DemoCalendarPage /> : <RealCalendarPage />;
}
