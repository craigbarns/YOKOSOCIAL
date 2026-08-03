"use client";

import { Button, Card, CardContent } from "@yokosocial/ui";
import { ArrowRight, Check, Globe2, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { BrandMark } from "@/components/layout/brand-mark";
import { saveActiveWorkspace } from "@/lib/active-workspace";
import { isPublicDemoMode } from "@/lib/demo-mode";

export default function OnboardingPage() {
  const router = useRouter();
  const { createOrganization, state } = useDemo();
  const [name, setName] = useState(state.organization?.name ?? "YokoSushi");
  const [websiteUrl, setWebsiteUrl] = useState(
    state.organization?.websiteUrl ?? "https://www.yokosushi.fr"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      if (isPublicDemoMode()) {
        createOrganization({ name, websiteUrl });
      } else {
        const response = await fetch("/api/organizations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, websiteUrl })
        });
        if (!response.ok) throw new Error("Impossible de créer l’organisation.");
        const payload = (await response.json()) as {
          organization: {
            id: string;
            name: string;
            role: "OWNER";
            brands: Array<{ id: string; name: string; websiteUrl: string | null }>;
          };
        };
        const brand = payload.organization.brands[0];
        if (!brand?.websiteUrl) throw new Error("La marque YokoSushi n’a pas pu être créée.");
        saveActiveWorkspace({
          organizationId: payload.organization.id,
          organizationName: payload.organization.name,
          brandId: brand.id,
          brandName: brand.name,
          websiteUrl: brand.websiteUrl,
          role: payload.organization.role
        });
      }
      router.push("/import");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="surface-grid bg-yoko-cream min-h-screen px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex items-center justify-between">
          <BrandMark className="text-yoko-ink" />
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
            Étape 1 sur 2
          </span>
        </div>
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-sm font-semibold text-rose-600">
            Bienvenue {state.user?.name ?? ""}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance text-slate-950 sm:text-5xl">
            Créons l’espace de votre marque.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Le site sert de source, mais chaque information locale critique restera à valider.
          </p>
        </div>
        <Card className="overflow-hidden border-white/80 shadow-xl shadow-slate-900/5">
          <CardContent className="p-6 sm:p-8">
            <form className="space-y-6" onSubmit={submit}>
              <label className="block text-sm font-semibold text-slate-700">
                Nom de l’organisation
                <span className="relative mt-2 block">
                  <Store className="absolute top-3.5 left-4 size-5 text-slate-400" />
                  <input
                    id="organization-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 pl-12 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  />
                </span>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Site internet à analyser
                <span className="relative mt-2 block">
                  <Globe2 className="absolute top-3.5 left-4 size-5 text-slate-400" />
                  <input
                    id="website-url"
                    type="url"
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    required
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 pl-12 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  />
                </span>
              </label>
              <div className="grid gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 sm:grid-cols-2">
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0" /> Import sans publication
                </span>
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0" /> Domaines externes non explorés
                </span>
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0" /> Données locales séparées
                </span>
                <span className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0" /> Validation humaine obligatoire
                </span>
              </div>
              {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <Button className="w-full sm:w-auto" size="lg" type="submit" disabled={loading}>
                {loading ? "Création…" : "Continuer vers l’import"}{" "}
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
