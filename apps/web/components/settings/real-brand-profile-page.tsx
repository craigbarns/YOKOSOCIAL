"use client";

import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import { ImageIcon, KeyRound, LoaderCircle, Palette, Save, Shield, Type, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  mediaItems,
  mediaTitle,
  requestJson,
  type RealBrandProfile,
  type RealMediaAsset,
  type RealPlatform
} from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";

type BrandTone = RealBrandProfile["tones"][number];

type BrandProfileForm = {
  logoMediaAssetId: string;
  slogan: string;
  story: string;
  cuisineType: string;
  positioning: string;
  targetAudience: string;
  geographicArea: string;
  priceRange: string;
  tones: BrandTone[];
  colors: string;
  typography: string;
  allowedExpressions: string;
  wordsToAvoid: string;
  allowedEmojis: string;
  emojiUsageLevel: number;
  languages: string;
  orderLinks: string;
  socialPlatforms: RealPlatform[];
  customInstruction: string;
};

const toneLabels: Record<BrandTone, string> = {
  PREMIUM: "premium",
  GOURMAND: "gourmand",
  WARM: "chaleureux",
  TRENDY: "tendance",
  FAMILY: "familial",
  MODERN: "moderne",
  DYNAMIC: "dynamique",
  HUMOROUS: "humoristique",
  SOBER: "sobre"
};

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function prettyJson(value: Record<string, unknown> | null): string {
  return value ? JSON.stringify(value, null, 2) : "";
}

function formFromProfile(profile: RealBrandProfile | null): BrandProfileForm {
  return {
    logoMediaAssetId: profile?.logoMediaAssetId ?? "",
    slogan: profile?.slogan ?? "",
    story: profile?.story ?? "",
    cuisineType: profile?.cuisineType ?? "",
    positioning: profile?.positioning ?? "",
    targetAudience: profile?.targetAudience ?? "",
    geographicArea: profile?.geographicArea ?? "",
    priceRange: profile?.priceRange ?? "",
    tones: profile?.tones ?? [],
    colors: prettyJson(profile?.colors ?? null),
    typography: prettyJson(profile?.typography ?? null),
    allowedExpressions: (profile?.allowedExpressions ?? []).join("\n"),
    wordsToAvoid: (profile?.wordsToAvoid ?? []).join("\n"),
    allowedEmojis: (profile?.allowedEmojis ?? []).join("\n"),
    emojiUsageLevel: profile?.emojiUsageLevel ?? 1,
    languages: (profile?.languages ?? ["fr"]).join(", "),
    orderLinks: prettyJson(profile?.orderLinks ?? null),
    socialPlatforms: profile?.socialPlatforms ?? [],
    customInstruction: profile?.customInstruction ?? ""
  };
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function uniqueLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function uniqueTokens(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function parseObject(value: string, label: string): Record<string, unknown> | null {
  if (!value.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} doit être un objet JSON valide.`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${label} doit être un objet JSON.`);
  }
  return parsed as Record<string, unknown>;
}

function validateOrderLinks(value: Record<string, unknown> | null): Record<string, string> | null {
  if (!value) return null;
  const result: Record<string, string> = {};
  for (const [label, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string") {
      throw new Error(`Le lien de commande « ${label} » doit être une URL.`);
    }
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    } catch {
      throw new Error(`Le lien de commande « ${label} » doit utiliser HTTP ou HTTPS.`);
    }
    result[label] = candidate;
  }
  return result;
}

export function RealBrandProfilePage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [brand, setBrand] = useState<{ id: string; name: string; websiteUrl: string | null }>();
  const [profile, setProfile] = useState<RealBrandProfile | null>(null);
  const [form, setForm] = useState<BrandProfileForm>();
  const [logos, setLogos] = useState<RealMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const loadProfile = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(undefined);
    const query = new URLSearchParams({
      organizationId: workspace.organizationId,
      brandId: workspace.brandId
    });
    const [profileResult, logoResult] = await Promise.allSettled([
      requestJson<{
        brand: { id: string; name: string; websiteUrl: string | null };
        profile: RealBrandProfile | null;
      }>(`/api/brand-profile?${query}`),
      requestJson<{ media?: RealMediaAsset[]; mediaAssets?: RealMediaAsset[] }>(
        `/api/media?${query}&category=LOGO&status=APPROVED&limit=100`
      )
    ]);

    if (profileResult.status === "fulfilled") {
      setBrand(profileResult.value.brand);
      setProfile(profileResult.value.profile);
      setForm(formFromProfile(profileResult.value.profile));
    } else {
      setError(
        profileResult.reason instanceof Error
          ? profileResult.reason.message
          : "Chargement du profil impossible."
      );
    }
    if (logoResult.status === "fulfilled") setLogos(mediaItems(logoResult.value));
    else if (profileResult.status === "fulfilled") {
      setError(
        "Le profil est disponible, mais les logos de la médiathèque n’ont pas pu être chargés."
      );
    }
    setLoading(false);
  }, [workspace]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const initialForm = useMemo(() => formFromProfile(profile), [profile]);
  const dirty = Boolean(form && JSON.stringify(form) !== JSON.stringify(initialForm));

  async function saveProfile() {
    if (!workspace || !form) return;
    const languages = uniqueTokens(form.languages);
    if (languages.length === 0) {
      setError("Renseignez au moins une langue, par exemple fr.");
      return;
    }
    if (!languages.every((language) => /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language))) {
      setError("Les langues doivent utiliser un code comme fr, en ou fr-FR.");
      return;
    }
    let colors: Record<string, unknown> | null;
    let typography: Record<string, unknown> | null;
    let orderLinks: Record<string, string> | null;
    try {
      colors = parseObject(form.colors, "La palette de couleurs");
      typography = parseObject(form.typography, "La typographie");
      orderLinks = validateOrderLinks(parseObject(form.orderLinks, "Les liens de commande"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Configuration JSON invalide.");
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = await requestJson<{ profile: RealBrandProfile }>("/api/brand-profile", {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          logoMediaAssetId: form.logoMediaAssetId || null,
          slogan: nullable(form.slogan),
          story: nullable(form.story),
          cuisineType: nullable(form.cuisineType),
          positioning: nullable(form.positioning),
          targetAudience: nullable(form.targetAudience),
          geographicArea: nullable(form.geographicArea),
          priceRange: nullable(form.priceRange),
          tones: form.tones,
          colors,
          typography,
          allowedExpressions: uniqueLines(form.allowedExpressions),
          wordsToAvoid: uniqueLines(form.wordsToAvoid),
          allowedEmojis: uniqueLines(form.allowedEmojis),
          emojiUsageLevel: form.emojiUsageLevel,
          languages,
          orderLinks,
          socialPlatforms: form.socialPlatforms,
          customInstruction: nullable(form.customInstruction)
        })
      });
      setProfile(payload.profile);
      setForm(formFromProfile(payload.profile));
      setNotice("Profil de marque réel enregistré et disponible pour les prochaines générations.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement du profil impossible.");
    } finally {
      setSaving(false);
    }
  }

  const selectedLogo =
    logos.find((item) => item.id === form?.logoMediaAssetId) ??
    (profile?.logo && profile.logoMediaAssetId === form?.logoMediaAssetId
      ? {
          id: profile.logo.id,
          publicUrl: profile.logo.publicUrl,
          altText: profile.logo.altText,
          qualityScore: 0,
          editorialCategory: "LOGO",
          status: profile.logo.status,
          width: profile.logo.width,
          height: profile.logo.height
        }
      : undefined);
  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Configuration · données réelles"
        title="Profil de marque"
        description="Ce contexte guide les textes générés. Il ne remplace jamais les produits, prix, promotions ou informations locales importés et validés."
        action={
          <Button onClick={() => void saveProfile()} disabled={saving || !dirty || !form}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Enregistrer
          </Button>
        }
      />

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadProfile())}
          >
            Réessayer
          </Button>
        </div>
      )}
      {notice && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement du profil réel…
          </CardContent>
        </Card>
      ) : !workspace || !form ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-slate-500">
            Le profil réel ne peut pas être affiché tant que l’organisation n’est pas disponible.
          </CardContent>
        </Card>
      ) : (
        <>
          {!profile && (
            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Aucun profil n’est encore enregistré. Les champs ci-dessous sont vides ; enregistrez
              uniquement des consignes validées par YokoSushi.
            </div>
          )}
          {dirty && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <span>Modifications non enregistrées.</span>
              <Button size="sm" variant="secondary" onClick={() => setForm(initialForm)}>
                <X className="size-3.5" /> Annuler
              </Button>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardContent className="space-y-6 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Nom de la marque">
                    <input
                      value={brand?.name ?? workspace?.brandName ?? ""}
                      readOnly
                      className={`${fieldClass} bg-slate-50 text-slate-500`}
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Le nom appartient à la marque de l’organisation.
                    </p>
                  </Field>
                  <Field label="Type de cuisine">
                    <input
                      value={form.cuisineType}
                      onChange={(event) => setForm({ ...form, cuisineType: event.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Slogan">
                    <input
                      value={form.slogan}
                      maxLength={300}
                      onChange={(event) => setForm({ ...form, slogan: event.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Gamme de prix">
                    <input
                      value={form.priceRange}
                      onChange={(event) => setForm({ ...form, priceRange: event.target.value })}
                      className={fieldClass}
                      placeholder="Description qualitative validée"
                    />
                  </Field>
                </div>

                <Field label="Histoire de la marque">
                  <textarea
                    rows={5}
                    value={form.story}
                    onChange={(event) => setForm({ ...form, story: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Positionnement">
                    <textarea
                      rows={4}
                      value={form.positioning}
                      onChange={(event) => setForm({ ...form, positioning: event.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Clientèle cible">
                    <textarea
                      rows={4}
                      value={form.targetAudience}
                      onChange={(event) => setForm({ ...form, targetAudience: event.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                </div>
                <Field label="Zone géographique">
                  <input
                    value={form.geographicArea}
                    onChange={(event) => setForm({ ...form, geographicArea: event.target.value })}
                    className={fieldClass}
                  />
                </Field>

                <div>
                  <p className="text-sm font-semibold text-slate-700">Tons de communication</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(Object.keys(toneLabels) as BrandTone[]).map((tone) => {
                      const selected = form.tones.includes(tone);
                      return (
                        <button
                          key={tone}
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              tones: selected
                                ? form.tones.filter((item) => item !== tone)
                                : [...form.tones, tone]
                            })
                          }
                          className={cn(
                            "rounded-full px-3 py-2 text-xs font-semibold ring-1",
                            selected
                              ? "bg-yoko-ink ring-yoko-ink text-white"
                              : "bg-white text-slate-600 ring-slate-200"
                          )}
                        >
                          {toneLabels[tone]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Consigne éditoriale personnalisée">
                  <textarea
                    rows={6}
                    value={form.customInstruction}
                    onChange={(event) =>
                      setForm({ ...form, customInstruction: event.target.value })
                    }
                    className={fieldClass}
                  />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Expressions autorisées (une par ligne)">
                    <textarea
                      rows={4}
                      value={form.allowedExpressions}
                      onChange={(event) =>
                        setForm({ ...form, allowedExpressions: event.target.value })
                      }
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Mots et expressions à éviter (un par ligne)">
                    <textarea
                      rows={4}
                      value={form.wordsToAvoid}
                      onChange={(event) => setForm({ ...form, wordsToAvoid: event.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Emojis autorisés (un par ligne)">
                    <textarea
                      rows={4}
                      value={form.allowedEmojis}
                      onChange={(event) => setForm({ ...form, allowedEmojis: event.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Niveau d’utilisation des emojis">
                    <select
                      value={form.emojiUsageLevel}
                      onChange={(event) =>
                        setForm({ ...form, emojiUsageLevel: Number(event.target.value) })
                      }
                      className={fieldClass}
                    >
                      <option value={0}>0 · Aucun</option>
                      <option value={1}>1 · Léger</option>
                      <option value={2}>2 · Modéré</option>
                      <option value={3}>3 · Expressif</option>
                    </select>
                  </Field>
                  <Field label="Langues (codes séparés par une virgule)">
                    <input
                      value={form.languages}
                      onChange={(event) => setForm({ ...form, languages: event.target.value })}
                      className={fieldClass}
                      placeholder="fr, en"
                    />
                  </Field>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Plateformes sociales</p>
                    <div className="mt-2 flex gap-2">
                      {(["INSTAGRAM", "FACEBOOK"] as const).map((platform) => {
                        const selected = form.socialPlatforms.includes(platform);
                        return (
                          <button
                            key={platform}
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                socialPlatforms: selected
                                  ? form.socialPlatforms.filter((item) => item !== platform)
                                  : [...form.socialPlatforms, platform]
                              })
                            }
                            className={cn(
                              "rounded-xl px-3 py-2.5 text-xs font-semibold ring-1",
                              selected
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : "bg-white text-slate-600 ring-slate-200"
                            )}
                          >
                            {platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Palette JSON">
                    <textarea
                      rows={6}
                      value={form.colors}
                      onChange={(event) => setForm({ ...form, colors: event.target.value })}
                      className={`${fieldClass} font-mono text-xs`}
                      placeholder={'{\n  "principal": "#111923"\n}'}
                    />
                  </Field>
                  <Field label="Typographies JSON">
                    <textarea
                      rows={6}
                      value={form.typography}
                      onChange={(event) => setForm({ ...form, typography: event.target.value })}
                      className={`${fieldClass} font-mono text-xs`}
                      placeholder={'{\n  "titres": "Nom validé"\n}'}
                    />
                  </Field>
                </div>
                <Field label="Liens de commande JSON">
                  <textarea
                    rows={5}
                    value={form.orderLinks}
                    onChange={(event) => setForm({ ...form, orderLinks: event.target.value })}
                    className={`${fieldClass} font-mono text-xs`}
                    placeholder={'{\n  "commande": "https://…"\n}'}
                  />
                </Field>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <ImageIcon className="size-5 text-rose-500" />
                    <h2 className="font-semibold">Logo de la marque</h2>
                  </div>
                  <div className="mt-5 grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-slate-50">
                    {selectedLogo?.publicUrl ? (
                      <img
                        src={selectedLogo.publicUrl}
                        alt={selectedLogo.altText ?? "Logo de la marque"}
                        className="max-h-full max-w-full object-contain p-4"
                      />
                    ) : (
                      <ImageIcon className="size-10 text-slate-300" />
                    )}
                  </div>
                  <select
                    value={form.logoMediaAssetId}
                    onChange={(event) => setForm({ ...form, logoMediaAssetId: event.target.value })}
                    className={`${fieldClass} mt-4`}
                  >
                    <option value="">Aucun logo sélectionné</option>
                    {profile?.logo && !logos.some((item) => item.id === profile.logo?.id) && (
                      <option value={profile.logo.id}>Logo actuel</option>
                    )}
                    {logos.map((logo) => (
                      <option key={logo.id} value={logo.id}>
                        {mediaTitle(logo)} · {logo.status}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Seuls les médias classés LOGO et approuvés sont proposés.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Palette className="size-5 text-rose-500" />
                    <h2 className="font-semibold">Identité visuelle</h2>
                  </div>
                  {form.colors ? (
                    <p className="mt-4 text-xs leading-5 text-slate-500">
                      La palette est conservée sous forme structurée et transmise au moteur de
                      contenu.
                    </p>
                  ) : (
                    <p className="mt-4 text-xs leading-5 text-slate-500">
                      Aucune palette réelle enregistrée.
                    </p>
                  )}
                  <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <Type className="size-4 text-slate-400" />
                    <span className="text-sm">
                      {form.typography
                        ? "Typographies structurées"
                        : "Typographies non renseignées"}
                    </span>
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

              <Button
                className="w-full"
                onClick={() => void saveProfile()}
                disabled={saving || !dirty}
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Enregistrer le profil réel
              </Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
