"use client";

import { Badge, Button, Card, CardContent } from "@yokosocial/ui";
import {
  AlertTriangle,
  Facebook,
  Instagram,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Unplug
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { requestJson, type RealSocialAccount } from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import { workspaceRoleAllows } from "@/lib/active-workspace";

type Connection = { connected: boolean; provider: "postiz"; mode: "real" | "mock" };

function accountStatus(status: RealSocialAccount["status"]): {
  label: string;
  tone: "green" | "amber" | "rose" | "slate";
} {
  if (status === "CONNECTED") return { label: "Connecté", tone: "green" };
  if (status === "EXPIRED") return { label: "Expiré", tone: "amber" };
  if (status === "ERROR") return { label: "Erreur", tone: "rose" };
  return { label: "Déconnecté", tone: "slate" };
}

export function RealSocialAccountsPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [accounts, setAccounts] = useState<RealSocialAccount[]>([]);
  const [mode, setMode] = useState<"real" | "mock">("mock");
  const [connection, setConnection] = useState<Connection>();
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"test" | "sync">();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlatform, setNewPlatform] = useState<"INSTAGRAM" | "FACEBOOK">("INSTAGRAM");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  async function handleAddManualAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !newDisplayName.trim()) return;
    setAddingAccount(true);
    setError(undefined);
    try {
      await requestJson("/api/social-accounts", {
        method: "POST",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          action: "connect_manual",
          platform: newPlatform,
          displayName: newDisplayName.trim(),
          username: newUsername.trim() || undefined
        })
      });
      setNotice(`Compte ${newPlatform === "INSTAGRAM" ? "Instagram" : "Facebook"} relié avec succès !`);
      setShowAddModal(false);
      setNewDisplayName("");
      setNewUsername("");
      await loadAccounts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ajout du compte impossible.");
    } finally {
      setAddingAccount(false);
    }
  }

  const loadAccounts = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    setError(undefined);
    try {
      const query = new URLSearchParams({
        organizationId: workspace.organizationId,
        brandId: workspace.brandId
      });
      const payload = await requestJson<{
        accounts: RealSocialAccount[];
        mode: "real" | "mock";
      }>(`/api/social-accounts?${query}`);
      setAccounts(payload.accounts);
      setMode(payload.mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chargement des comptes impossible.");
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const canManageAccounts = workspaceRoleAllows(workspace?.role, ["OWNER", "ADMIN"]);

  async function postizAction(nextAction: "test" | "sync") {
    if (!workspace || !canManageAccounts) return;
    setAction(nextAction);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = await requestJson<{
        connection: Connection;
        accounts?: RealSocialAccount[];
        ignoredIntegrations?: number;
      }>("/api/social-accounts", {
        method: "POST",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          action: nextAction
        })
      });
      setConnection(payload.connection);
      if (nextAction === "test") {
        setNotice(
          payload.connection.connected
            ? `Connexion Postiz ${payload.connection.mode} opérationnelle.`
            : "Postiz a répondu mais la connexion n’est pas active."
        );
      } else {
        setNotice(
          `${payload.accounts?.length ?? 0} compte(s) Instagram/Facebook synchronisé(s)` +
            (payload.ignoredIntegrations
              ? ` · ${payload.ignoredIntegrations} intégration(s) non prise(s) en charge ignorée(s).`
              : ".")
        );
        await loadAccounts();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opération Postiz impossible.");
    } finally {
      setAction(undefined);
    }
  }

  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Publication · espace réel"
        title="Comptes sociaux"
        description="Postiz connecte et programme les réseaux. FeedPulse conserve les contenus, la validation humaine et le suivi des statuts."
        action={
          canManageAccounts ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="border border-rose-300 text-rose-700 hover:bg-rose-50"
                onClick={() => setShowAddModal(true)}
              >
                + Connecter un compte
              </Button>
              <Button
                variant="secondary"
                onClick={() => void postizAction("test")}
                disabled={Boolean(action)}
              >
                {action === "test" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <PlugZap className="size-4" />
                )}
                Tester Postiz
              </Button>
              <Button onClick={() => void postizAction("sync")} disabled={Boolean(action)}>
                {action === "sync" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Synchroniser
              </Button>
            </div>
          ) : (
            <Badge tone="slate">Lecture seule · {workspace?.role ?? "—"}</Badge>
          )
        }
      />

      <div
        className={`mb-5 rounded-2xl p-4 text-sm ring-1 ${
          mode === "real"
            ? "bg-blue-50 text-blue-900 ring-blue-200"
            : "bg-amber-50 text-amber-900 ring-amber-200"
        }`}
      >
        <div className="flex gap-3">
          {mode === "real" ? (
            <ShieldCheck className="size-5 shrink-0" />
          ) : (
            <AlertTriangle className="size-5 shrink-0" />
          )}
          <div>
            <p className="font-semibold">
              {mode === "real"
                ? "RealPostizProvider actif"
                : "MockPostizProvider actif dans l’espace réel"}
            </p>
            <p className="mt-1 opacity-80">
              {mode === "real"
                ? "Les actions ci-dessous interrogent votre instance Postiz configurée côté serveur. Aucun token n’est exposé au navigateur."
                : "Le workflow utilise vos données réelles, mais la connexion et la publication Postiz restent simulées."}
            </p>
          </div>
        </div>
      </div>

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void (workspaceError ? refresh() : loadAccounts())}
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Connecter un compte Réseaux Sociaux</h2>
            <p className="mt-1 text-xs text-slate-500">
              Associez directement le compte Instagram ou la page Facebook de votre restaurant.
            </p>
            <form onSubmit={handleAddManualAccount} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Réseau social</label>
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setNewPlatform("INSTAGRAM")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                      newPlatform === "INSTAGRAM"
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Instagram className="size-4" /> Instagram
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPlatform("FACEBOOK")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                      newPlatform === "FACEBOOK"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <Facebook className="size-4" /> Facebook
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Nom du compte / Page</label>
                <input
                  type="text"
                  required
                  placeholder={newPlatform === "INSTAGRAM" ? "YokoSushi Compans" : "YokoSushi Toulouse"}
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Handle / Identifiant (@compte)</label>
                <input
                  type="text"
                  placeholder={newPlatform === "INSTAGRAM" ? "@yokosushi_toulouse" : "yokosushi.officiel"}
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={addingAccount || !newDisplayName.trim()}
                  className="bg-rose-600 text-white hover:bg-rose-700"
                >
                  {addingAccount ? <LoaderCircle className="size-4 animate-spin" /> : "Enregistrer et Connecter"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {connection && (
        <Card className="mb-5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <span
                className={`grid size-10 place-items-center rounded-xl ${
                  connection.connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {connection.connected ? (
                  <ShieldCheck className="size-5" />
                ) : (
                  <Unplug className="size-5" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {connection.connected ? "Connexion vérifiée" : "Connexion indisponible"}
                </p>
                <p className="text-xs text-slate-500">Provider Postiz · mode {connection.mode}</p>
              </div>
            </div>
            <Badge tone={connection.connected ? "green" : "rose"}>
              {connection.connected ? "Opérationnel" : "Non connecté"}
            </Badge>
          </CardContent>
        </Card>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement des comptes Postiz…
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Unplug className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Aucun compte synchronisé</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
              Testez la connexion puis synchronisez les intégrations Instagram et Facebook
              disponibles dans Postiz.
            </p>
            {canManageAccounts && (
              <Button
                className="mt-5"
                onClick={() => void postizAction("sync")}
                disabled={Boolean(action)}
              >
                <RefreshCw className="size-4" /> Synchroniser maintenant
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {accounts.map((account) => {
            const Icon = account.platform === "INSTAGRAM" ? Instagram : Facebook;
            const status = accountStatus(account.status);
            return (
              <Card key={account.id}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                      <Icon className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold">{account.displayName}</h2>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {account.username ?? "Aucun identifiant public transmis par Postiz"}
                      </p>
                      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                        <div>
                          <dt className="text-slate-400">Réseau</dt>
                          <dd className="mt-1 font-semibold">{account.platform}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Dernière synchro</dt>
                          <dd className="mt-1 font-semibold">
                            {account.lastSyncedAt
                              ? new Date(account.lastSyncedAt).toLocaleString("fr-FR", {
                                  dateStyle: "short",
                                  timeStyle: "short"
                                })
                              : "Jamais"}
                          </dd>
                        </div>
                      </dl>
                      {account.establishmentId && (
                        <p className="mt-3 text-xs text-slate-500">
                          Compte limité à un établissement. Seules les publications locales
                          compatibles pourront l’utiliser.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
