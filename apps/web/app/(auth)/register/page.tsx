"use client";

import { Button } from "@yokosocial/ui";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AuthShell } from "@/components/layout/auth-shell";
import { authClient } from "@/lib/auth-client";
import { isPublicDemoMode } from "@/lib/demo-mode";

export default function RegisterPage() {
  const demoMode = isPublicDemoMode();
  const router = useRouter();
  const { register, state } = useDemo();
  const [name, setName] = useState(demoMode ? "Administrateur Marque" : "");
  const [email, setEmail] = useState(demoMode ? "demo@feedpulse.local" : "");
  const [password, setPassword] = useState(demoMode ? "demonstration" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    try {
      if (demoMode) {
        await register({ name, email });
      } else {
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) {
          console.error("[signUp error]", result.error);
          throw new Error(result.error.message || "Impossible de créer ce compte.");
        }
      }
      router.push("/onboarding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <ShieldCheck className="size-4" /> Aucune publication sans validation
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
          Créer votre espace.
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {demoMode
            ? "Cette inscription est locale et fictive. Aucune donnée externe n’est utilisée."
            : "Votre compte et sa session sécurisée seront conservés dans PostgreSQL Supabase."}
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-medium text-slate-700">
          Nom complet
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!state.hydrated}
            required
            autoComplete="name"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          />
        </label>
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
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mot de passe
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={!state.hydrated}
            required
            minLength={12}
            autoComplete="new-password"
            className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          />
        </label>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button
          className="mt-2 w-full"
          size="lg"
          disabled={loading || !state.hydrated}
          type="submit"
        >
          {loading ? "Création…" : "Créer mon espace"}
          {!loading && <ArrowRight className="size-4" />}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-slate-500">
        Déjà un compte ?{" "}
        <Link className="font-semibold text-rose-600" href="/login">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
