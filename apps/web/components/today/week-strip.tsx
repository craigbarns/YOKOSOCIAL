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
