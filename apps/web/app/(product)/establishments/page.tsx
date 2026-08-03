"use client";

import { demoEstablishments } from "@yokosocial/shared";
import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import { AlertTriangle, MapPin, Phone, Store } from "lucide-react";

import { RealEstablishmentsPage } from "@/components/establishments/real-establishments-page";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { isPublicDemoMode } from "@/lib/demo-mode";

function DemoEstablishmentsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Données locales"
        title="Établissements"
        description="Les informations sont isolées par restaurant. Ces fiches de démonstration ne reprennent aucune coordonnée réelle."
        action={
          <Button variant="secondary">
            <Store className="size-4" /> Ajouter un établissement
          </Button>
        }
      />
      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
        <p>
          <strong>Démonstration :</strong> validez les données réellement importées avant toute
          utilisation locale dans une publication.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {demoEstablishments.map((establishment) => (
          <Card key={establishment.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <Store className="size-5" />
                </span>
                <Badge tone="amber">Validation requise</Badge>
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">{establishment.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{establishment.city}</p>
              <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
                <p className="flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  {establishment.address}
                </p>
                <p className="flex gap-2">
                  <Phone className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  {establishment.phone}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {establishment.services.map((service) => (
                  <Badge key={service}>{service}</Badge>
                ))}
              </div>
              <div className="mt-5 flex gap-2">
                <Button size="sm">Vérifier la fiche</Button>
                <Button size="sm" variant="secondary">
                  Modifier
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

export default function EstablishmentsPage() {
  return isPublicDemoMode() ? <DemoEstablishmentsPage /> : <RealEstablishmentsPage />;
}
