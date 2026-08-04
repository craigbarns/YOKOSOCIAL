"use client";

import { resolveNextAction, type NextAction, type TodaySnapshot } from "@yokosocial/shared";
import { Button, Card, CardContent } from "@yokosocial/ui";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { ActionCard } from "@/components/today/action-card";
import { WeekStrip } from "@/components/today/week-strip";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import { fetchToday, TodayRequestError } from "@/lib/api/today";
import { buildDemoTodaySnapshot } from "@/lib/today-snapshot-demo";

const IMPORT_POLL_INTERVAL = 8_000;

function TodayLayout({
  brandName,
  snapshot,
  action,
  error,
  onRetry,
  busy
}: {
  brandName: string;
  snapshot?: TodaySnapshot | undefined;
  action?: NextAction | undefined;
  error?: string | undefined;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Aujourd’hui"
        title={`Bonjour, ${brandName}`}
        description="Une seule chose à la fois. Le reste attend son tour."
      />
      {error && (
        <Card className="mb-5 border-amber-200 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 text-sm text-amber-900">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      )}
      {busy && !snapshot ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Un instant…
          </CardContent>
        </Card>
      ) : (
        action && snapshot && (
          <>
            <ActionCard action={action} />
            <WeekStrip snapshot={snapshot} />
          </>
        )
      )}
    </AppShell>
  );
}

function DemoTodayPage() {
  const { state } = useDemo();
  const snapshot = useMemo(() => buildDemoTodaySnapshot(state), [state]);
  return (
    <TodayLayout
      brandName={snapshot.brandName}
      snapshot={snapshot}
      action={resolveNextAction(snapshot)}
      onRetry={() => undefined}
      busy={false}
    />
  );
}

function RealTodayPage() {
  const { workspace, loading: workspaceLoading, error: workspaceError, refresh } = useRealWorkspace();
  const [payload, setPayload] = useState<{ snapshot: TodaySnapshot; action: NextAction }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      try {
        const next = await fetchToday({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId
        });
        setPayload(next);
        setError(undefined);
      } catch (caught) {
        setError(
          caught instanceof TodayRequestError
            ? caught.message
            : "Impossible de charger votre journée. Réessayez."
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workspace]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const importRunning = payload?.action.kind === "IMPORT_RUNNING";
  useEffect(() => {
    if (!importRunning) return;
    const interval = window.setInterval(() => void load(true), IMPORT_POLL_INTERVAL);
    return () => window.clearInterval(interval);
  }, [importRunning, load]);

  return (
    <TodayLayout
      brandName={payload?.snapshot.brandName ?? workspace?.brandName ?? "votre restaurant"}
      snapshot={payload?.snapshot}
      action={payload?.action}
      error={workspaceError ?? error}
      onRetry={() => void (workspaceError ? refresh() : load())}
      busy={workspaceLoading || loading}
    />
  );
}

export function TodayPage({ demoMode }: { demoMode: boolean }) {
  return demoMode ? <DemoTodayPage /> : <RealTodayPage />;
}
