import { Badge } from "@yokosocial/ui";

import { BrandMark } from "./brand-mark";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
      <section className="surface-grid bg-yoko-ink relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-32 -right-24 size-96 rounded-full bg-rose-400/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-16 size-96 rounded-full bg-orange-300/10 blur-3xl" />
        <BrandMark className="relative z-10" />
        <div className="relative z-10 my-auto max-w-xl">
          <Badge className="mb-7 bg-white/10 text-white ring-1 ring-white/15" tone="slate">
            Pilotage social intelligent
          </Badge>
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance">
            Du site YokoSushi au calendrier social, avec vous aux commandes.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            Importez les contenus, préparez les publications Instagram et Facebook, validez chaque
            détail puis programmez avec Postiz.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-6 border-t border-white/10 pt-6 text-xs text-slate-400">
          <span>Validation humaine obligatoire</span>
          <span>•</span>
          <span>Mode démonstration hors ligne</span>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <BrandMark className="text-yoko-ink mb-10 lg:hidden" />
          {children}
        </div>
      </section>
    </main>
  );
}
