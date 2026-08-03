"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import { Facebook, Instagram, PlugZap, ShieldCheck } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { RealSocialAccountsPage } from "@/components/social-accounts/real-social-accounts-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

function DemoSocialAccountsPage() {
  const accounts = [
    {
      name: "YokoSushi Toulouse — compte fictif",
      handle: "@yokosushi_demo",
      platform: "Instagram",
      icon: Instagram
    },
    {
      name: "YokoSushi Toulouse — page fictive",
      handle: "Page de démonstration",
      platform: "Facebook",
      icon: Facebook
    }
  ];
  return (
    <AppShell>
      <PageHeader
        eyebrow="Publication"
        title="Comptes sociaux"
        description="Postiz reste le moteur de connexion et de programmation. FeedPulse conserve le workflow éditorial."
        action={
          <Button variant="secondary">
            <PlugZap className="size-4" /> Tester la connexion
          </Button>
        }
      />
      <div className="mb-5 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900 ring-1 ring-blue-200">
        <div className="flex gap-3">
          <ShieldCheck className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">MockPostizProvider actif</p>
            <p className="mt-1 text-blue-700">
              Aucun token Meta ou Postiz n’est utilisé. Les comptes et statistiques ci-dessous sont
              fictifs.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {accounts.map((account) => (
          <Card key={account.platform}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-12 place-items-center rounded-2xl bg-slate-950 text-white">
                <account.icon className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold">{account.name}</h2>
                  <Badge tone="green">Connecté</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">{account.handle}</p>
              </div>
              <Button size="sm" variant="secondary">
                Configurer
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <CardContent>
          <h2 className="font-semibold">Scénarios disponibles en démonstration</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Succès</p>
              <p className="mt-1 text-xs text-emerald-700">
                Programmation puis publication simulée.
              </p>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">Erreur certaine</p>
              <p className="mt-1 text-xs text-red-700">
                Échec enregistré, sans secret dans les logs.
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">État distant incertain</p>
              <p className="mt-1 text-xs text-amber-700">
                Aucun renvoi automatique avant rapprochement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

export default function SocialAccountsPage() {
  return isPublicDemoMode() ? <DemoSocialAccountsPage /> : <RealSocialAccountsPage />;
}
