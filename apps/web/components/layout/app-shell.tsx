"use client";

import { Badge, Button, cn } from "@yokosocial/ui";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CircleUserRound,
  Images,
  Import,
  LayoutDashboard,
  Menu,
  PackageOpen,
  PenSquare,
  Settings,
  Share2,
  Store,
  Sun,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { authClient } from "@/lib/auth-client";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  readActiveWorkspace,
  type ActiveWorkspace
} from "@/lib/active-workspace";
import { isPublicDemoMode } from "@/lib/demo-mode";

import { BrandMark } from "./brand-mark";

const navigation = [
  { href: "/today", label: "Aujourd’hui", icon: Sun },
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendrier", icon: CalendarDays },
  { href: "/posts", label: "Publications", icon: PenSquare },
  { href: "/media", label: "Médiathèque", icon: Images },
  { href: "/products", label: "Carte et produits", icon: PackageOpen },
  { href: "/establishments", label: "Établissements", icon: Store },
  { href: "/import", label: "Import du site", icon: Import },
  { href: "/social-accounts", label: "Comptes sociaux", icon: Share2 },
  { href: "/settings", label: "Paramètres", icon: Settings }
] as const;

function Sidebar({ demoMode, onNavigate }: { demoMode: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="bg-yoko-ink flex h-full flex-col px-3 py-5 text-white">
      <BrandMark className="mb-8 px-3" />
      <nav className="space-y-1" aria-label="Navigation principale">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-white/8 hover:text-white"
              )}
            >
              <Icon className={cn("size-[18px]", active ? "text-rose-500" : "text-slate-400")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.06] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold">{demoMode ? "Mode démo" : "Mode réel"}</span>
          <Badge className="bg-emerald-400/15 text-emerald-300" tone="slate">
            Actif
          </Badge>
        </div>
        <p className="text-[11px] leading-4 text-slate-400">
          {demoMode
            ? "Aucune donnée fictive ne sera publiée."
            : "Validation humaine obligatoire avant Postiz."}
        </p>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const demoMode = isPublicDemoMode();
  const router = useRouter();
  const { state, resetDemo } = useDemo();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspace, setWorkspace] = useState<ActiveWorkspace>();

  useEffect(() => {
    if (!demoMode) setWorkspace(readActiveWorkspace());
  }, [demoMode]);

  async function logout() {
    if (demoMode) {
      resetDemo();
    } else {
      await authClient.signOut();
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    }
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-[248px] lg:block">
        <Sidebar demoMode={demoMode} />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[280px] shadow-2xl">
            <button
              className="absolute top-5 right-4 z-10 rounded-lg p-2 text-slate-300 hover:bg-white/10"
              aria-label="Fermer"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-5" />
            </button>
            <Sidebar demoMode={demoMode} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <Button
              className="lg:hidden"
              variant="ghost"
              size="icon"
              aria-label="Ouvrir le menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <div className="hidden items-center gap-2 text-sm sm:flex">
              <Building2 className="size-4 text-rose-500" />
              <span className="font-semibold text-slate-800">
                {demoMode
                  ? (state.organization?.name ?? "YokoSushi")
                  : (workspace?.organizationName ?? "YokoSushi")}
              </span>
              <ChevronDown className="size-3.5 text-slate-400" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-semibold text-slate-800">
                {demoMode ? (state.user?.name ?? "Responsable YokoSushi") : "Compte connecté"}
              </span>
              <span className="block text-[11px] text-slate-500">
                {demoMode ? "Démonstration" : "Session sécurisée"}
              </span>
            </span>
            <button
              className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600 ring-1 ring-slate-200"
              title={demoMode ? "Réinitialiser la démonstration" : "Se déconnecter"}
              onClick={() => void logout()}
            >
              <CircleUserRound className="size-5" />
            </button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-7 sm:py-8 xl:px-10">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-bold tracking-[0.16em] text-rose-600 uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}
