"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import { KeyRound, Palette, Save, Shield, Type } from "lucide-react";
import { useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { RealBrandProfilePage } from "@/components/settings/real-brand-profile-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

const tones = [
  "premium",
  "gourmand",
  "chaleureux",
  "tendance",
  "familial",
  "moderne",
  "dynamique",
  "sobre"
];

function DemoSettingsPage() {
  const [selectedTones, setSelectedTones] = useState(["gourmand", "moderne", "chaleureux"]);
  const [saved, setSaved] = useState(false);
  return (
    <AppShell>
      <PageHeader
        eyebrow="Configuration"
        title="Profil de marque"
        description="Ce contexte guide les textes sans jamais remplacer les données factuelles importées et validées."
        action={
          <Button
            onClick={() => {
              setSaved(true);
              window.setTimeout(() => setSaved(false), 1800);
            }}
          >
            <Save className="size-4" /> {saved ? "Enregistré" : "Enregistrer"}
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Nom de la marque
                <input
                  defaultValue="YokoSushi"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-4 font-normal outline-none focus:border-rose-400"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Langue principale
                <select
                  defaultValue="fr"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-rose-400"
                >
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Consigne éditoriale
              <textarea
                defaultValue="Mettre en valeur la fraîcheur, la générosité des plateaux et la livraison uniquement lorsqu’elle est validée. Utiliser un ton moderne, gourmand et direct. Éviter les textes trop longs et les formulations artificielles."
                rows={5}
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-4 leading-6 font-normal outline-none focus:border-rose-400"
              />
            </label>
            <div>
              <p className="text-sm font-semibold text-slate-700">Tons de communication</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tones.map((tone) => {
                  const selected = selectedTones.includes(tone);
                  return (
                    <button
                      key={tone}
                      onClick={() =>
                        setSelectedTones((current) =>
                          selected ? current.filter((item) => item !== tone) : [...current, tone]
                        )
                      }
                      className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 ${selected ? "bg-yoko-ink ring-yoko-ink text-white" : "bg-white text-slate-600 ring-slate-200"}`}
                    >
                      {tone}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Expressions à éviter
                <textarea
                  defaultValue={"explosion de saveurs\nexpérience inoubliable\nfausse urgence"}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-200 p-4 leading-6 font-normal outline-none focus:border-rose-400"
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Emojis autorisés
                <textarea
                  defaultValue="🍣 🥢 ✨ ❤️"
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-slate-200 p-4 leading-6 font-normal outline-none focus:border-rose-400"
                />
              </label>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <Palette className="size-5 text-rose-500" />
                <h2 className="font-semibold">Identité visuelle</h2>
              </div>
              <div className="mt-5 flex gap-3">
                {["#111923", "#e14b5a", "#ff7a6f", "#fff8f2"].map((color) => (
                  <span
                    key={color}
                    className="size-10 rounded-xl ring-1 ring-slate-200"
                    style={{ background: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <Type className="size-4 text-slate-400" />
                <span className="text-sm">Typographies à confirmer</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex items-center gap-3">
                <Shield className="size-5 text-emerald-600" />
                <h2 className="font-semibold">Secrets serveur</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Les clés OpenAI, Postiz, S3 et les tokens sociaux ne sont jamais transmis au
                navigateur.
              </p>
              <Badge className="mt-4" tone="green">
                <KeyRound className="mr-1 size-3" /> Configuration protégée
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export default function SettingsPage() {
  return isPublicDemoMode() ? <DemoSettingsPage /> : <RealBrandProfilePage />;
}
