"use client";

import { demoProducts } from "@yokosocial/shared";
import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import { AlertTriangle, PackageOpen, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { RealProductsPage } from "@/components/products/real-products-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

function DemoProductsPage() {
  const { state } = useDemo();
  const [query, setQuery] = useState("");
  const products = demoProducts.filter(
    (product) =>
      state.import.selectedProductIds.includes(product.id) &&
      `${product.name} ${product.category}`
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr"))
  );
  return (
    <AppShell>
      <PageHeader
        eyebrow="Catalogue"
        title="Carte et produits"
        description="Chaque prix et chaque promotion restent liés à leur source et à une validation."
        action={
          <Button variant="secondary">
            <SlidersHorizontal className="size-4" /> Catégories
          </Button>
        }
      />
      {!state.import.confirmed ? (
        <Card>
          <CardContent className="py-16 text-center">
            <PackageOpen className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Aucun produit importé</h2>
            <Button asChild className="mt-5">
              <Link href="/import">Analyser le site</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative max-w-lg flex-1">
                <Search className="absolute top-3 left-3.5 size-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher dans la carte…"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-4 pl-10 text-sm outline-none focus:border-rose-400"
                />
              </label>
              <Badge tone="amber">
                <AlertTriangle className="mr-1 size-3" /> Données fictives
              </Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{product.name}</h2>
                      <Badge>{product.category}</Badge>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm text-slate-500">{product.description}</p>
                    <p className="mt-2 text-xs text-amber-700">
                      Association établissement à vérifier · source de démonstration
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-400">Prix non renseigné</p>
                    <Button className="mt-2" size="sm" variant="secondary">
                      Modifier
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

export default function ProductsPage() {
  return isPublicDemoMode() ? <DemoProductsPage /> : <RealProductsPage />;
}
