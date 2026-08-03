"use client";

import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import { ImageIcon, Layers3, LoaderCircle, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDemo } from "@/components/demo/demo-provider";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { PostEditor } from "@/components/posts/post-editor";
import { RealPostsPage } from "@/components/posts/real-posts-page";
import { isPublicDemoMode } from "@/lib/demo-mode";

const shortStatus = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "À valider",
  APPROVED: "Approuvée",
  SCHEDULED: "Programmée",
  PUBLISHING: "Publication",
  PUBLISHED: "Publiée",
  REJECTED: "Refusée",
  FAILED: "Erreur",
  CANCELLED: "Annulée"
} as const;

function DemoPostsPage() {
  const { state, generatePosts } = useDemo();
  const [selectedId, setSelectedId] = useState(state.posts[0]?.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const selectedPost = state.posts.find((post) => post.id === selectedId) ?? state.posts[0];

  useEffect(() => {
    if (!selectedId && state.posts[0]) setSelectedId(state.posts[0].id);
  }, [selectedId, state.posts]);

  async function generate() {
    setLoading(true);
    setError(undefined);
    try {
      await generatePosts();
      setSelectedId("demo-post-1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Génération impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Studio éditorial"
        title="Publications"
        description="Instagram et Facebook reçoivent des textes distincts. Une modification après approbation réinitialise la validation."
        action={
          <Button onClick={() => void generate()} disabled={loading || !state.import.confirmed}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <WandSparkles className="size-4" />
            )}
            {state.posts.length ? "Régénérer 5 idées" : "Générer 5 publications"}
          </Button>
        }
      />
      {!state.import.confirmed && (
        <Card>
          <CardContent className="py-14 text-center">
            <ImageIcon className="mx-auto size-9 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Importez d’abord vos contenus</h2>
            <p className="mt-2 text-sm text-slate-500">
              La génération est fondée uniquement sur des produits et médias sélectionnés.
            </p>
            <Button asChild className="mt-5">
              <Link href="/import">Ouvrir l’import</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {state.import.confirmed && state.posts.length === 0 && (
        <Card className="overflow-hidden">
          <CardContent className="surface-grid py-16 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <Sparkles className="size-7" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              Votre première série éditoriale
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Le provider mock créera cinq formats variés à partir des données fictives
              sélectionnées, avec avertissements explicites.
            </p>
            {error && (
              <p className="mx-auto mt-4 max-w-md rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button className="mt-6" size="lg" onClick={() => void generate()} disabled={loading}>
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              {loading ? "Génération…" : "Générer les 5 propositions"}
            </Button>
          </CardContent>
        </Card>
      )}
      {state.posts.length > 0 && (
        <div className="space-y-5">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {state.posts.map((post, index) => (
              <button
                key={post.id}
                onClick={() => setSelectedId(post.id)}
                className={cn(
                  "min-w-[220px] rounded-2xl border p-4 text-left transition",
                  selectedPost?.id === post.id
                    ? "border-rose-400 bg-white shadow-md ring-2 ring-rose-100"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    {post.format === "carousel" ? (
                      <Layers3 className="size-4" />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                  </span>
                  <Badge
                    tone={
                      post.status === "APPROVED" || post.status === "SCHEDULED"
                        ? "green"
                        : post.status === "FAILED" || post.status === "REJECTED"
                          ? "rose"
                          : post.status === "PENDING_REVIEW"
                            ? "amber"
                            : "slate"
                    }
                  >
                    {shortStatus[post.status]}
                  </Badge>
                </div>
                <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Proposition {index + 1} · {post.format}
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                  {post.title}
                </p>
              </button>
            ))}
          </div>
          {selectedPost && <PostEditor post={selectedPost} />}
        </div>
      )}
      {state.posts.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw className="size-3.5" /> Les brouillons sont sauvegardés automatiquement sur cet
          appareil en mode démo.
        </div>
      )}
    </AppShell>
  );
}

export default function PostsPage() {
  return isPublicDemoMode() ? <DemoPostsPage /> : <RealPostsPage />;
}
