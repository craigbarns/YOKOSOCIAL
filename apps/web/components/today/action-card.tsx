"use client";

import type { NextAction } from "@yokosocial/shared";
import { Button, Card, CardContent } from "@yokosocial/ui";
import {
  ArrowRight,
  CalendarCheck,
  CircleAlert,
  Globe2,
  Instagram,
  LoaderCircle,
  PackageOpen,
  Sparkles
} from "lucide-react";
import Link from "next/link";

type Presentation = {
  eyebrow: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  icon: typeof Sparkles;
  tone: "rose" | "amber" | "emerald";
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

function present(action: NextAction): Presentation {
  switch (action.kind) {
    case "IMPORT_WEBSITE":
      return {
        eyebrow: "Première étape",
        title: "Collons votre site.",
        description:
          "Nous y récupérons vos plats et vos photos. Rien n’est publié : vous validez tout avant.",
        cta: { label: "Analyser mon site", href: "/import" },
        icon: Globe2,
        tone: "rose"
      };
    case "IMPORT_RUNNING":
      return {
        eyebrow: "En cours",
        title: "Nous lisons votre site.",
        description: `${action.pagesScanned} page(s) lue(s) · ${action.productsDetected} plat(s) trouvé(s) · ${action.imagesDetected} photo(s).`,
        icon: LoaderCircle,
        tone: "amber"
      };
    case "IMPORT_FAILED":
      return {
        eyebrow: "À reprendre",
        title: "Nous n’avons pas pu lire votre site.",
        description:
          "L’adresse est peut-être inaccessible depuis l’extérieur. Vérifiez-la et relancez l’analyse.",
        cta: { label: "Reprendre l’analyse", href: "/import" },
        icon: CircleAlert,
        tone: "amber"
      };
    case "FIX_FAILED_POSTS":
      return {
        eyebrow: "À corriger",
        title:
          action.count === 1
            ? "Une publication n’est pas partie."
            : `${action.count} publications ne sont pas parties.`,
        description: "Ouvrez-les pour voir ce qui bloque et relancer l’envoi.",
        cta: { label: "Voir les publications", href: "/posts" },
        icon: CircleAlert,
        tone: "amber"
      };
    case "CONFIRM_IMPORT":
      return {
        eyebrow: "À confirmer",
        title: "Votre import attend votre confirmation.",
        description:
          "Rien de nouveau n’a été trouvé depuis la dernière fois. Ouvrez l’aperçu pour clore l’import.",
        cta: { label: "Ouvrir l’aperçu", href: "/import" },
        icon: PackageOpen,
        tone: "amber"
      };
    case "REVIEW_CATALOG":
      return {
        eyebrow: "À valider",
        title: `${action.products} plats et ${action.media} photos vous attendent.`,
        description: "Un coup d’œil, un clic, et votre carte est en ligne dans l’application.",
        cta: { label: "Vérifier l’aperçu", href: "/import" },
        icon: PackageOpen,
        tone: "rose"
      };
    case "REVIEW_POSTS":
      return {
        eyebrow: "Votre rendez-vous",
        title:
          action.count === 1
            ? "Une publication vous attend."
            : `${action.count} publications vous attendent.`,
        description: `Environ ${action.estimatedMinutes} minute(s). Rien ne part sans votre accord.`,
        cta: { label: "Commencer", href: "/posts" },
        icon: Sparkles,
        tone: "rose"
      };
    case "CONNECT_SOCIAL":
      return {
        eyebrow: "Dernière étape",
        title: "Plus qu’une chose : connecter Instagram.",
        description: "Sans compte connecté, vos publications validées ne peuvent pas être programmées.",
        cta: { label: "Connecter un compte", href: "/social-accounts" },
        icon: Instagram,
        tone: "rose"
      };
    case "ALL_CLEAR":
      return {
        eyebrow: "Tout est en ordre",
        title: "Rien à faire aujourd’hui.",
        description: action.nextScheduledAt
          ? `Prochaine publication le ${formatDate(action.nextScheduledAt)}.`
          : "Aucune publication programmée pour le moment.",
        cta: { label: "Voir mon calendrier", href: "/calendar" },
        icon: CalendarCheck,
        tone: "emerald"
      };
  }
}

const TONES = {
  rose: "border-rose-100 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60",
  amber: "border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-white",
  emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white"
} as const;

export function ActionCard({ action }: { action: NextAction }) {
  const view = present(action);
  const Icon = view.icon;
  const spinning = action.kind === "IMPORT_RUNNING";

  return (
    <Card className={TONES[view.tone]}>
      <CardContent className="p-6 sm:p-10">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-rose-600 uppercase">
          <Icon className={spinning ? "size-4 animate-spin" : "size-4"} />
          {view.eyebrow}
        </p>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-balance text-slate-950 sm:text-4xl">
          {view.title}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">{view.description}</p>
        {view.cta && (
          <Button asChild className="mt-7" size="lg">
            <Link href={view.cta.href}>
              {view.cta.label} <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
