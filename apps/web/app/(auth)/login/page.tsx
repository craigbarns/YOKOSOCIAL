"use client";

import { Button } from "@yokosocial/ui";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AuthShell } from "@/components/layout/auth-shell";
import { authClient } from "@/lib/auth-client";
import { isPublicDemoMode } from "@/lib/demo-mode";

export default function LoginPage() {
  const demoMode = isPublicDemoMode();
  const router = useRouter();
  const { login, state } = useDemo();
  const [email, setEmail] = useState(
    demoMode ? (state.user?.email ?? "demo@yokosocial.local") : ""
  );
  const [password, setPassword] = useState(demoMode ? "demonstration" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      if (demoMode) {
        await login({ name: state.user?.name ?? "Administrateur Marque", email });
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error("E-mail ou mot de passe incorrect.");
      }
      router.push(demoMode && !state.organization ? "/onboarding" : "/today");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-600">
          <Sparkles className="size-4" />
          {demoMode ? "Mode démonstration activé" : "Espace FeedPulse sécurisé"}
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Bon retour.</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {demoMode
            ? "Les identifiants ci-dessous sont fictifs et restent sur cet appareil."
            : "Connectez-vous avec le compte créé pour votre organisation."}
        </p>
      </div>

      <form className="space-y-5" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Adresse e-mail
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!state.hydrated}
            required
            autoComplete="email"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 transition outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mot de passe
          <div className="relative mt-2">
            <LockKeyhole className="pointer-events-none absolute top-3.5 left-4 size-5 text-slate-400" />
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!state.hydrated}
              required
              minLength={12}
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pr-4 pl-12 transition outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
            />
          </div>
        </label>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button className="w-full" size="lg" disabled={loading || !state.hydrated} type="submit">
          {loading ? "Connexion…" : demoMode ? "Ouvrir la démonstration" : "Se connecter"}
          {!loading && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-500">
        Première visite ?{" "}
        <Link className="font-semibold text-rose-600 hover:text-rose-700" href="/register">
          Créer un compte
        </Link>
      </p>
    </AuthShell>
  );
}
