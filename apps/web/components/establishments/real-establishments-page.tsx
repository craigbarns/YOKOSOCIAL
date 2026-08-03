"use client";

import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Store,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { requestJson, type RealEstablishment } from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";

type EstablishmentForm = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string;
  businessHours: string;
  services: string;
  orderUrl: string;
  reservationUrl: string;
  instagramUrl: string;
  facebookUrl: string;
};

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

function formFromEstablishment(item: RealEstablishment): EstablishmentForm {
  return {
    name: item.name,
    addressLine1: item.addressLine1 ?? "",
    addressLine2: item.addressLine2 ?? "",
    postalCode: item.postalCode ?? "",
    city: item.city ?? "",
    countryCode: item.countryCode ?? "FR",
    phone: item.phone ?? "",
    businessHours: item.businessHours ? JSON.stringify(item.businessHours, null, 2) : "",
    services: (item.services ?? []).join("\n"),
    orderUrl: item.orderUrl ?? "",
    reservationUrl: item.reservationUrl ?? "",
    instagramUrl: item.instagramUrl ?? "",
    facebookUrl: item.facebookUrl ?? ""
  };
}

function uniqueLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseBusinessHours(value: string): Record<string, unknown> | null {
  if (!value.trim()) return null;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Les horaires doivent être un objet JSON avec un libellé par jour ou période.");
  }
  return parsed as Record<string, unknown>;
}

function validationTone(status: string): "green" | "amber" | "rose" {
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "rose";
  return "amber";
}

export function RealEstablishmentsPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [establishments, setEstablishments] = useState<RealEstablishment[]>([]);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<EstablishmentForm>();
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const loadEstablishments = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(undefined);
    try {
      const query = new URLSearchParams({
        organizationId: workspace.organizationId,
        brandId: workspace.brandId
      });
      const payload = await requestJson<{ establishments: RealEstablishment[] }>(
        `/api/establishments?${query}`
      );
      setEstablishments(payload.establishments);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Chargement des établissements impossible."
      );
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void loadEstablishments();
  }, [loadEstablishments]);

  const editing = establishments.find((item) => item.id === editingId);
  useEffect(() => {
    if (!editing) {
      setForm(undefined);
      return;
    }
    setForm(formFromEstablishment(editing));
    setCriticalConfirmed(false);
  }, [editing]);

  const initialForm = useMemo(
    () => (editing ? formFromEstablishment(editing) : undefined),
    [editing]
  );
  const dirty = Boolean(
    form && initialForm && JSON.stringify(form) !== JSON.stringify(initialForm)
  );
  const criticalDirty = Boolean(
    form &&
    initialForm &&
    [
      "addressLine1",
      "addressLine2",
      "postalCode",
      "city",
      "countryCode",
      "phone",
      "businessHours"
    ].some(
      (key) => form[key as keyof EstablishmentForm] !== initialForm[key as keyof EstablishmentForm]
    )
  );

  function patchFromForm(
    item: RealEstablishment,
    value: EstablishmentForm
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (value.name.trim() !== item.name) patch.name = value.name.trim();
    const nullableFields = [
      "addressLine1",
      "addressLine2",
      "postalCode",
      "city",
      "phone",
      "orderUrl",
      "reservationUrl",
      "instagramUrl",
      "facebookUrl"
    ] as const;
    for (const field of nullableFields) {
      const next = nullable(value[field]);
      if (next !== (item[field] ?? null)) patch[field] = next;
    }
    const countryCode = value.countryCode.trim().toUpperCase();
    if (countryCode !== (item.countryCode ?? "FR")) patch.countryCode = countryCode;
    const businessHours = parseBusinessHours(value.businessHours);
    if (!sameJson(businessHours, item.businessHours ?? null)) patch.businessHours = businessHours;
    const services = uniqueLines(value.services);
    if (!sameJson(services, item.services ?? [])) patch.services = services;
    return patch;
  }

  async function createEstablishment() {
    if (!workspace || newName.trim().length < 2) {
      setError("Le nom du nouvel établissement doit contenir au moins deux caractères.");
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = await requestJson<{ establishment: RealEstablishment }>(
        "/api/establishments",
        {
          method: "POST",
          body: JSON.stringify({
            organizationId: workspace.organizationId,
            brandId: workspace.brandId,
            name: newName.trim(),
            ...(newCity.trim() ? { city: newCity.trim() } : {})
          })
        }
      );
      setNewName("");
      setNewCity("");
      setCreating(false);
      setNotice("Établissement créé en attente de vérification.");
      await loadEstablishments();
      setEditingId(payload.establishment.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEstablishment() {
    if (!workspace || !editing || !form) return;
    if (form.name.trim().length < 2) {
      setError("Le nom de l’établissement doit contenir au moins deux caractères.");
      return;
    }
    let changes: Record<string, unknown>;
    try {
      changes = patchFromForm(editing, form);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Horaires invalides.");
      return;
    }
    if (Object.keys(changes).length === 0) {
      setError("Aucune modification à enregistrer.");
      return;
    }
    if (criticalDirty && !criticalConfirmed) {
      setError(
        "Confirmez explicitement l’adresse, le téléphone et les horaires avant d’enregistrer."
      );
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson("/api/establishments", {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          establishmentId: editing.id,
          ...changes,
          ...(criticalDirty ? { criticalFieldsConfirmed: true } : {})
        })
      });
      setNotice("Fiche enregistrée. Les données locales critiques confirmées sont journalisées.");
      await loadEstablishments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewEstablishment(decision: "APPROVED" | "REJECTED") {
    if (!workspace || !editing) return;
    if (dirty) {
      setError("Des changements ne sont pas sauvegardés : enregistrez d’abord la fiche visible.");
      return;
    }
    if (decision === "APPROVED" && !criticalConfirmed) {
      setError("Confirmez explicitement l’adresse, le téléphone et les horaires avant validation.");
      return;
    }
    setSaving(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson("/api/establishments", {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          establishmentId: editing.id,
          reviewDecision: decision,
          ...(decision === "APPROVED" ? { criticalFieldsConfirmed: true } : {})
        })
      });
      setNotice(
        decision === "APPROVED"
          ? "Établissement validé et activé pour les contenus locaux."
          : "Établissement rejeté et maintenu hors des générations locales."
      );
      setCriticalConfirmed(false);
      await loadEstablishments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Décision impossible.");
    } finally {
      setSaving(false);
    }
  }

  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Données locales · espace réel"
        title="Établissements"
        description="Chaque fiche reste isolée. Adresse, téléphone et horaires doivent être confirmés explicitement avant activation et utilisation dans une publication locale."
        action={
          <Button variant="secondary" onClick={() => setCreating((current) => !current)}>
            {creating ? <X className="size-4" /> : <Plus className="size-4" />}
            {creating ? "Fermer" : "Ajouter un établissement"}
          </Button>
        }
      />

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadEstablishments())}
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

      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <p>
          Une fiche non approuvée reste exclue des générations locales. La validation confirme les
          coordonnées visibles et passe l’établissement au statut actif.
        </p>
      </div>

      {creating && (
        <Card className="mb-5 border-rose-200">
          <CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label>
              <span className="mb-1.5 block text-xs font-semibold">Nom</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold">Ville (facultative)</span>
              <input
                value={newCity}
                onChange={(event) => setNewCity(event.target.value)}
                className={fieldClass}
              />
            </label>
            <Button onClick={() => void createEstablishment()} disabled={saving}>
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Créer la fiche
            </Button>
          </CardContent>
        </Card>
      )}

      {editing && form && (
        <Card className="mb-5 border-rose-200">
          <CardContent className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Vérifier « {editing.name} »</p>
                <p className="mt-1 text-xs text-slate-500">
                  Les champs vides sont enregistrés comme non renseignés ; aucune information n’est
                  inventée.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditingId(undefined)}
                aria-label="Fermer"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nom">
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Téléphone · critique">
                <input
                  value={form.phone}
                  onChange={(event) => {
                    setForm({ ...form, phone: event.target.value });
                    setCriticalConfirmed(false);
                  }}
                  className={fieldClass}
                  placeholder="Non renseigné"
                />
              </Field>
              <Field label="Adresse · critique">
                <input
                  value={form.addressLine1}
                  onChange={(event) => {
                    setForm({ ...form, addressLine1: event.target.value });
                    setCriticalConfirmed(false);
                  }}
                  className={fieldClass}
                  placeholder="Ligne 1"
                />
              </Field>
              <Field label="Complément d’adresse · critique">
                <input
                  value={form.addressLine2}
                  onChange={(event) => {
                    setForm({ ...form, addressLine2: event.target.value });
                    setCriticalConfirmed(false);
                  }}
                  className={fieldClass}
                  placeholder="Facultatif"
                />
              </Field>
              <Field label="Code postal · critique">
                <input
                  value={form.postalCode}
                  onChange={(event) => {
                    setForm({ ...form, postalCode: event.target.value });
                    setCriticalConfirmed(false);
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Ville · critique">
                <input
                  value={form.city}
                  onChange={(event) => {
                    setForm({ ...form, city: event.target.value });
                    setCriticalConfirmed(false);
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Code pays · critique">
                <input
                  value={form.countryCode}
                  maxLength={2}
                  onChange={(event) => {
                    setForm({ ...form, countryCode: event.target.value.toUpperCase() });
                    setCriticalConfirmed(false);
                  }}
                  className={fieldClass}
                />
              </Field>
              <Field label="Services (un par ligne)">
                <textarea
                  rows={3}
                  value={form.services}
                  onChange={(event) => setForm({ ...form, services: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Horaires JSON · critique" className="md:col-span-2">
                <textarea
                  rows={7}
                  value={form.businessHours}
                  onChange={(event) => {
                    setForm({ ...form, businessHours: event.target.value });
                    setCriticalConfirmed(false);
                  }}
                  placeholder={'{\n  "lundi": "12:00–14:00"\n}'}
                  className={`${fieldClass} font-mono text-xs`}
                />
              </Field>
              <Field label="Lien de commande">
                <input
                  type="url"
                  value={form.orderUrl}
                  onChange={(event) => setForm({ ...form, orderUrl: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Lien de réservation">
                <input
                  type="url"
                  value={form.reservationUrl}
                  onChange={(event) => setForm({ ...form, reservationUrl: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Lien Instagram">
                <input
                  type="url"
                  value={form.instagramUrl}
                  onChange={(event) => setForm({ ...form, instagramUrl: event.target.value })}
                  className={fieldClass}
                />
              </Field>
              <Field label="Lien Facebook">
                <input
                  type="url"
                  value={form.facebookUrl}
                  onChange={(event) => setForm({ ...form, facebookUrl: event.target.value })}
                  className={fieldClass}
                />
              </Field>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <input
                type="checkbox"
                checked={criticalConfirmed}
                onChange={(event) => setCriticalConfirmed(event.target.checked)}
                className="mt-0.5 size-4 accent-rose-500"
              />
              <span>
                <strong>Confirmation explicite :</strong> j’ai vérifié l’adresse, le téléphone et
                les horaires visibles ci-dessus avec une source fiable. Cette confirmation est
                requise pour toute modification critique et pour l’activation.
              </span>
            </label>

            {dirty && (
              <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
                Des changements sont en attente. Enregistrez-les avant de valider ou rejeter la
                fiche.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveEstablishment()} disabled={saving || !dirty}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Enregistrer les corrections
              </Button>
              <Button onClick={() => void reviewEstablishment("APPROVED")} disabled={saving}>
                <Check className="size-4" /> Valider et activer
              </Button>
              <Button
                variant="danger"
                onClick={() => void reviewEstablishment("REJECTED")}
                disabled={saving}
              >
                <X className="size-4" /> Rejeter la fiche
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement des fiches réelles…
          </CardContent>
        </Card>
      ) : !workspace ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-slate-500">
            Les établissements réels ne peuvent pas être affichés tant que l’organisation n’est pas
            disponible.
          </CardContent>
        </Card>
      ) : establishments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Store className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Aucun établissement réel</h2>
            <p className="mt-2 text-sm text-slate-500">
              Lancez un import ou créez une fiche à vérifier.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {establishments.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600">
                    <Store className="size-5" />
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge tone={validationTone(item.validationStatus)}>
                      {item.validationStatus === "APPROVED"
                        ? "Validé"
                        : item.validationStatus === "REJECTED"
                          ? "Rejeté"
                          : "Validation requise"}
                    </Badge>
                    <Badge tone={item.status === "ACTIVE" ? "green" : "slate"}>
                      {item.status === "ACTIVE" ? "Actif" : item.status}
                    </Badge>
                  </div>
                </div>
                <h2 className="mt-5 text-xl font-semibold tracking-tight">{item.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{item.city ?? "Ville non renseignée"}</p>
                <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
                  <p className="flex gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    {[item.addressLine1, item.addressLine2, item.postalCode, item.city]
                      .filter(Boolean)
                      .join(", ") || "Adresse non renseignée"}
                  </p>
                  <p className="flex gap-2">
                    <Phone className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    {item.phone ?? "Téléphone non renseigné"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(item.services ?? []).map((service) => (
                    <Badge key={service}>{service}</Badge>
                  ))}
                  {(item.services ?? []).length === 0 && (
                    <span className="text-xs text-slate-400">Aucun service renseigné</span>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setEditingId(item.id)}>
                    <Pencil className="size-3.5" /> Vérifier la fiche
                  </Button>
                  {item.sourceUrl && (
                    <Button asChild size="sm" variant="secondary">
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" /> Source
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Field({
  label,
  className,
  children
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
