"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Images,
  PackageOpen,
  Sparkles,
  WandSparkles
} from "lucide-react";
import Link from "next/link";

import { useDemo } from "@/components/demo/demo-provider";
import { RealDashboardPage } from "@/components/dashboard/real-dashboard-page";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { isPublicDemoMode } from "@/lib/demo-mode";

const focusItems = ["Un plateau", "La livraison", "Le restaurant", "Un produit précis"];

function DemoDashboardPage() {
  const { state } = useDemo();
  const scheduled = state.posts.filter((post) => post.status === "SCHEDULED").length;
  const approved = state.posts.filter((post) => post.status === "APPROVED").length;
  const pending = state.posts.filter((post) => post.status === "PENDING_REVIEW").length;
  const failed = state.posts.filter((post) => post.status === "FAILED").length;

  const metrics = [
    { label: "À valider", value: pending, icon: CheckCircle2, tone: "amber" },
    { label: "Approuvées", value: approved, icon: CheckCircle2, tone: "green" },
    { label: "Programmées", value: scheduled, icon: CalendarClock, tone: "blue" },
    { label: "En erreur", value: failed, icon: CircleAlert, tone: "rose" }
  ] as const;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Vue d’ensemble"
        title="Bonjour, prêt pour la semaine ?"
        description="Vos contenus restent des brouillons jusqu’à leur approbation explicite."
        action={
          <Button asChild>
            <Link href="/posts">
              <WandSparkles className="size-4" /> Générer 5 publications
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                  {metric.value}
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
                <p className="text-sm font-semibold text-slate-900">Votre bibliothèque</p>
                <p className="mt-1 text-xs text-slate-500">Après sélection et confirmation</p>
              </div>
              <Images className="size-5 text-rose-500" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-2xl font-semibold text-slate-950">
                  {state.import.confirmed ? state.import.selectedMediaIds.length : 0}
                </p>
                <p className="mt-1 text-xs text-slate-500">médias importés</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-2xl font-semibold text-slate-950">
                  {state.import.confirmed ? state.import.selectedProductIds.length : 0}
                </p>
                <p className="mt-1 text-xs text-slate-500">produits importés</p>
              </div>
            </div>
            <Button asChild className="mt-5 w-full" variant="secondary">
              <Link href={state.import.confirmed ? "/media" : "/import"}>
                {state.import.confirmed ? "Voir la médiathèque" : "Commencer l’import"}
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
              <Badge tone="blue">Calendrier</Badge>
            </div>
            {state.posts.filter((post) => post.status === "SCHEDULED").length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <CalendarClock className="mx-auto size-7 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Aucune publication programmée
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Générez, validez puis choisissez une date.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {state.posts
                  .filter((post) => post.status === "SCHEDULED")
                  .slice(0, 3)
                  .map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
                    >
                      <div className="grid size-10 place-items-center rounded-lg bg-white text-rose-500">
                        <CalendarClock className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{post.title}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(post.scheduledAt ?? "").toLocaleString("fr-FR")}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-semibold text-slate-950">Import du site</h2>
              <Badge tone={state.import.confirmed ? "green" : "amber"}>
                {state.import.confirmed ? "Confirmé" : "À faire"}
              </Badge>
            </div>
            <div className="flex items-start gap-4 rounded-xl bg-slate-50 p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-rose-500 shadow-sm">
                <PackageOpen className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">www.yokosushi.fr</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Les modifications critiques sont toujours comparées et soumises à validation.
                </p>
              </div>
            </div>
            <Button asChild className="mt-5 w-full" variant="secondary">
              <Link href="/import">
                Ouvrir l’import <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}

export default function DashboardPage() {
  return isPublicDemoMode() ? <DemoDashboardPage /> : <RealDashboardPage />;
}
