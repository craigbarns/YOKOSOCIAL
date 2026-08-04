"use client";

import { Badge, Button, Card, CardContent, cn } from "@yokosocial/ui";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Facebook,
  ImageIcon,
  Instagram,
  LoaderCircle,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  WandSparkles,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import {
  mediaItems,
  mediaTitle,
  requestJson,
  type EditablePlatform,
  type RealCampaign,
  type RealEstablishment,
  type RealMediaAsset,
  type RealPost,
  type RealPostStatus,
  type RealSocialAccount,
  toEditablePlatform
} from "@/components/real/real-api";
import { useRealWorkspace } from "@/components/workspace/use-real-workspace";
import { workspaceRoleAllows } from "@/lib/active-workspace";
import { pollingIntervalLabel, publicationPollingInterval } from "@/lib/publication-polling";
import { isProgrammableSocialAccount } from "@/lib/social-account";

const statusLabels: Record<RealPostStatus, string> = {
  DRAFT: "Brouillon",
  PENDING_REVIEW: "À valider",
  APPROVED: "Approuvée",
  SCHEDULED: "Programmée",
  PUBLISHING: "Publication",
  PUBLISHED: "Publiée",
  REJECTED: "Refusée",
  FAILED: "Erreur",
  CANCELLED: "Annulée"
};

const formatLabels = {
  image: "Image",
  carousel: "Carrousel",
  story: "Story",
  reel: "Reel (script)"
} as const;

const topicLabels = {
  product: "Produit",
  platter: "Plateau",
  restaurant: "Restaurant",
  ambiance: "Ambiance",
  promotion: "Promotion validée",
  delivery: "Livraison",
  behind_the_scenes: "Coulisses",
  team: "Équipe",
  seasonal: "Saisonnier",
  local: "Local"
} as const;

const rejectionReasons = {
  TEXT_TOO_LONG: "Texte trop long",
  TEXT_TOO_GENERIC: "Texte trop générique",
  WRONG_PHOTO: "Mauvaise photo",
  WRONG_PRODUCT: "Mauvais produit",
  WRONG_INFORMATION: "Mauvaise information",
  WRONG_DATE: "Mauvaise date",
  WRONG_TONE: "Ton non adapté",
  OTHER: "Autre"
} as const;

type PostForm = {
  title: string;
  objective: string;
  platforms: EditablePlatform[];
  format: keyof typeof formatLabels;
  topic: keyof typeof topicLabels;
  instagramCaption: string;
  facebookCaption: string;
  callToAction: string;
  hashtags: string;
  establishmentIds: string[];
  mediaAssetIds: string[];
  scheduledAt: string;
  internalNote: string;
};

function postForm(post: RealPost): PostForm {
  return {
    title: post.title,
    objective: post.objective,
    platforms: post.platforms.map(toEditablePlatform),
    format: post.format.toLocaleLowerCase("en") as PostForm["format"],
    topic: post.topic.toLocaleLowerCase("en") as PostForm["topic"],
    instagramCaption: post.instagramCaption ?? "",
    facebookCaption: post.facebookCaption ?? "",
    callToAction: post.callToAction,
    hashtags: post.hashtags.join(" "),
    establishmentIds: post.establishmentLinks.map((item) => item.establishment.id),
    mediaAssetIds: post.media.map((item) => item.mediaAsset.id),
    scheduledAt: toLocalDateTime(post.scheduledAt),
    internalNote: ""
  };
}

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseHashtags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ]
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
    .slice(0, 12);
}

function statusTone(status: RealPostStatus): "slate" | "green" | "amber" | "rose" | "blue" {
  if (["APPROVED", "PUBLISHED"].includes(status)) return "green";
  if (["PENDING_REVIEW", "PUBLISHING"].includes(status)) return "amber";
  if (["REJECTED", "FAILED", "CANCELLED"].includes(status)) return "rose";
  if (status === "SCHEDULED") return "blue";
  return "slate";
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold text-slate-700">{children}</span>;
}

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:ring-2 focus:ring-rose-100";

export function RealPostsPage() {
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    refresh
  } = useRealWorkspace();
  const [posts, setPosts] = useState<RealPost[]>([]);
  const [establishments, setEstablishments] = useState<RealEstablishment[]>([]);
  const [media, setMedia] = useState<RealMediaAsset[]>([]);
  const [mediaPagination, setMediaPagination] = useState({ total: 0, pages: 0 });
  const [accounts, setAccounts] = useState<RealSocialAccount[]>([]);
  const [providerMode, setProviderMode] = useState<"real" | "mock">("mock");
  const [selectedId, setSelectedId] = useState<string>();
  const [form, setForm] = useState<PostForm>();
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [campaignId, setCampaignId] = useState<string>();
  const [generationPlatforms, setGenerationPlatforms] = useState<EditablePlatform[]>([
    "instagram",
    "facebook"
  ]);
  const [generationEstablishments, setGenerationEstablishments] = useState<string[]>([]);
  const [rejectionReason, setRejectionReason] =
    useState<keyof typeof rejectionReasons>("TEXT_TOO_GENERIC");
  const [rejectionNote, setRejectionNote] = useState("");
  const [accountByPlatform, setAccountByPlatform] = useState<Partial<Record<string, string>>>({});

  const canEditPosts = workspaceRoleAllows(workspace?.role, ["OWNER", "ADMIN", "EDITOR"]);
  const canReviewPosts = workspaceRoleAllows(workspace?.role, ["OWNER", "ADMIN", "REVIEWER"]);

  const selectedPost = posts.find((item) => item.id === selectedId) ?? posts[0];

  const loadData = useCallback(
    async (silent = false) => {
      if (!workspace) return;
      if (!silent) setLoading(true);
      if (!silent) setError(undefined);
      const query = new URLSearchParams({
        organizationId: workspace.organizationId,
        brandId: workspace.brandId
      });
      const mediaQuery = new URLSearchParams(query);
      mediaQuery.set("limit", "100");
      try {
        const [postPayload, establishmentPayload, accountPayload, mediaPayload] = await Promise.all(
          [
            requestJson<{ posts: RealPost[] }>(`/api/posts?${query}`),
            requestJson<{ establishments: RealEstablishment[] }>(`/api/establishments?${query}`),
            requestJson<{ accounts: RealSocialAccount[]; mode: "real" | "mock" }>(
              `/api/social-accounts?${query}`
            ),
            requestJson<{
              media?: RealMediaAsset[];
              mediaAssets?: RealMediaAsset[];
              pagination: { total: number; pages: number };
            }>(`/api/media?${mediaQuery}`)
          ]
        );
        setPosts(postPayload.posts);
        setEstablishments(establishmentPayload.establishments);
        setAccounts(accountPayload.accounts);
        setProviderMode(accountPayload.mode);
        setMedia(mediaItems(mediaPayload));
        setMediaPagination(mediaPayload.pagination);
        setSelectedId((current) =>
          current && postPayload.posts.some((item) => item.id === current)
            ? current
            : postPayload.posts[0]?.id
        );
        setGenerationEstablishments((current) =>
          current.length
            ? current
            : establishmentPayload.establishments
                .filter((item) => item.status === "ACTIVE" && item.validationStatus === "APPROVED")
                .map((item) => item.id)
        );
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Chargement des publications impossible."
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [workspace]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedPost) {
      setForm(undefined);
      return;
    }
    setForm(postForm(selectedPost));
    const defaults: Partial<Record<string, string>> = {};
    for (const platform of selectedPost.platforms) {
      const eligible = accounts.filter(
        (account) => account.platform === platform && isProgrammableSocialAccount(account)
      );
      if (eligible[0]) defaults[platform] = eligible[0].id;
    }
    setAccountByPlatform(defaults);
  }, [accounts, selectedPost]);

  useEffect(() => {
    if (!campaignId || !workspace) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        const payload = await requestJson<{ campaign: RealCampaign }>(
          `/api/content/campaigns/${campaignId}?organizationId=${encodeURIComponent(workspace.organizationId)}`
        );
        if (cancelled) return;
        if (payload.campaign.status === "COMPLETED") {
          setCampaignId(undefined);
          setNotice(
            `${payload.campaign.posts.length} publication(s) générée(s) et enregistrée(s).`
          );
          await loadData(true);
          return;
        }
        if (payload.campaign.status === "CANCELLED") {
          setCampaignId(undefined);
          setError("La génération a été annulée avant son exécution.");
          return;
        }
        attempts += 1;
        if (attempts >= 90) {
          setCampaignId(undefined);
          setNotice(
            "La génération continue en arrière-plan. Rechargez les publications dans quelques instants."
          );
          return;
        }
        timer = setTimeout(() => void poll(), 2_000);
      } catch (caught) {
        if (!cancelled) {
          setCampaignId(undefined);
          setError(caught instanceof Error ? caught.message : "Suivi de génération impossible.");
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [campaignId, loadData, workspace]);

  const publicationPollInterval = publicationPollingInterval(posts);

  useEffect(() => {
    if (!publicationPollInterval) return;
    const interval = window.setInterval(() => void loadData(true), publicationPollInterval);
    return () => window.clearInterval(interval);
  }, [loadData, publicationPollInterval]);

  async function approveAndScheduleAllPosts() {
    if (!workspace) return;
    setMutating(true);
    setError(undefined);
    setNotice(undefined);
    try {
      let approvedCount = 0;
      for (const post of posts) {
        if (post.status === "PENDING_REVIEW" || post.status === "DRAFT") {
          await requestJson(`/api/posts/${post.id}/transition`, {
            method: "POST",
            body: JSON.stringify({
              organizationId: workspace.organizationId,
              action: post.status === "DRAFT" ? "submit" : "approve"
            })
          });
          approvedCount++;
        }
      }
      setNotice(`✨ ${approvedCount} publication(s) validée(s) et prêtes pour la diffusion !`);
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approbation globale impossible.");
    } finally {
      setMutating(false);
    }
  }

  async function generatePosts() {
    if (!workspace || !canEditPosts || generationPlatforms.length === 0) return;
    setMutating(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = await requestJson<{ campaign: { id: string } }>("/api/content/generate", {
        method: "POST",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          brandId: workspace.brandId,
          establishmentIds: generationEstablishments,
          platforms: generationPlatforms,
          count: 5,
          startDate: new Date().toISOString(),
          preferredTopics: []
        })
      });
      setCampaignId(payload.campaign.id);
      setNotice("Génération placée dans la file du worker. Cette page suit son avancement.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Génération impossible.");
    } finally {
      setMutating(false);
    }
  }

  function validateForm(value: PostForm): string | undefined {
    if (!value.title.trim() || !value.objective.trim() || !value.callToAction.trim()) {
      return "Le titre, l’objectif et l’appel à l’action sont obligatoires.";
    }
    if (value.platforms.length === 0) return "Choisissez au moins un réseau.";
    if (value.platforms.includes("instagram") && !value.instagramCaption.trim()) {
      return "La légende Instagram est obligatoire lorsque ce réseau est sélectionné.";
    }
    if (value.platforms.includes("facebook") && !value.facebookCaption.trim()) {
      return "La légende Facebook est obligatoire lorsque ce réseau est sélectionné.";
    }
    const count = value.mediaAssetIds.length;
    if (value.format === "image" && count !== 1) return "Une publication image utilise une photo.";
    if (value.format === "carousel" && (count < 2 || count > 10)) {
      return "Un carrousel utilise entre 2 et 10 photos.";
    }
    if ((value.format === "story" || value.format === "reel") && count < 1) {
      return "Ce format nécessite au moins un média.";
    }
    return undefined;
  }

  async function savePost() {
    if (!workspace || !canEditPosts || !selectedPost || !form) return;
    const issue = validateForm(form);
    if (issue) {
      setError(issue);
      return;
    }
    setMutating(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson(`/api/posts/${selectedPost.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          title: form.title.trim(),
          objective: form.objective.trim(),
          platforms: form.platforms,
          format: form.format,
          topic: form.topic,
          instagramCaption: form.instagramCaption.trim() || null,
          facebookCaption: form.facebookCaption.trim() || null,
          callToAction: form.callToAction.trim(),
          hashtags: parseHashtags(form.hashtags),
          establishmentIds: form.establishmentIds,
          mediaAssetIds: form.mediaAssetIds,
          scheduledAt: toIsoDateTime(form.scheduledAt),
          internalNote: form.internalNote.trim() || null
        })
      });
      setNotice("Brouillon sauvegardé. Toute approbation précédente a été réinitialisée.");
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sauvegarde impossible.");
    } finally {
      setMutating(false);
    }
  }

  async function transition(action: "submit" | "approve" | "reject" | "reopen" | "cancel") {
    if (!workspace || !selectedPost) return;
    const reviewerAction = action === "approve" || action === "reject";
    if ((reviewerAction && !canReviewPosts) || (!reviewerAction && !canEditPosts)) return;
    if ((action === "submit" || action === "approve") && dirty) {
      setError(
        "Des changements ne sont pas sauvegardés : sauvegardez d’abord la version affichée."
      );
      return;
    }
    setMutating(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await requestJson(`/api/posts/${selectedPost.id}/transition`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          action,
          ...(action === "reject"
            ? {
                reason: rejectionReason,
                ...(rejectionNote.trim() ? { note: rejectionNote.trim() } : {})
              }
            : {})
        })
      });
      setNotice(
        action === "submit"
          ? "Publication envoyée en validation humaine."
          : action === "approve"
            ? "Version courante approuvée. Elle peut maintenant être programmée."
            : action === "reject"
              ? "Publication refusée. Le motif sera disponible pour les générations futures."
              : action === "reopen"
                ? "Publication rouverte en brouillon."
                : "Publication annulée."
      );
      setRejectionNote("");
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Changement de statut impossible.");
    } finally {
      setMutating(false);
    }
  }

  async function schedulePost() {
    if (!workspace || !canEditPosts || !selectedPost || !form) return;
    if (dirty) {
      setError(
        "Des changements ne sont pas sauvegardés : sauvegardez d’abord avant de programmer."
      );
      return;
    }
    const scheduledAt = toIsoDateTime(form.scheduledAt);
    if (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now()) {
      setError("Choisissez une date de programmation future.");
      return;
    }
    const selectedAccounts = selectedPost.platforms.map((platform) => accountByPlatform[platform]);
    if (selectedAccounts.some((accountId) => !accountId)) {
      setError("Sélectionnez exactement un compte connecté pour chaque réseau.");
      return;
    }
    setMutating(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await requestJson<{
        jobsCreated: number;
        jobsQueued: number;
        warning: string | null;
      }>(`/api/posts/${selectedPost.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          scheduledAt,
          socialAccountIds: selectedAccounts
        })
      });
      setNotice(
        `${result.jobsQueued}/${result.jobsCreated} tâche(s) mise(s) en file.` +
          (result.warning
            ? ` ${result.warning}`
            : " Le worker et le statut distant sont suivis automatiquement.")
      );
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Programmation impossible.");
    } finally {
      setMutating(false);
    }
  }

  async function requeuePendingPublicationJobs() {
    if (
      !workspace ||
      !canEditPosts ||
      !selectedPost?.scheduledAt ||
      selectedPost.status !== "SCHEDULED"
    ) {
      return;
    }
    const socialAccountIds = [
      ...new Set((selectedPost.publicationJobs ?? []).map((job) => job.socialAccount.id))
    ];
    if (socialAccountIds.length === 0) {
      setError("Aucune tâche de publication en attente ne doit être remise en file.");
      return;
    }
    setMutating(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await requestJson<{
        jobsCreated: number;
        jobsQueued: number;
        recovered: boolean;
        warning: string | null;
      }>(`/api/posts/${selectedPost.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: workspace.organizationId,
          scheduledAt: selectedPost.scheduledAt,
          socialAccountIds
        })
      });
      setNotice(
        `${result.jobsQueued}/${result.jobsCreated} tâche(s) remise(s) en file.` +
          (result.warning ? ` ${result.warning}` : " Le worker reprendra leur traitement.")
      );
      await loadData(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Remise en file impossible.");
    } finally {
      setMutating(false);
    }
  }

  const selectedMedia = useMemo(() => {
    if (!form) return [];
    const postAssets = selectedPost?.media.map((item) => item.mediaAsset) ?? [];
    const byId = new Map([...postAssets, ...media].map((item) => [item.id, item]));
    return form.mediaAssetIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }, [form, media, selectedPost]);

  const approvedMedia = media.filter(
    (item) => item.status === "APPROVED" && (item.publicUrl || item.sourceUrl)
  );
  const approvedEstablishments = establishments.filter(
    (item) => item.status === "ACTIVE" && item.validationStatus === "APPROVED"
  );
  const dirty = Boolean(
    form && selectedPost && JSON.stringify(form) !== JSON.stringify(postForm(selectedPost))
  );
  const locked = Boolean(
    selectedPost &&
    ["SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "CANCELLED"].includes(selectedPost.status)
  );
  const contentReadOnly = locked || !canEditPosts;
  const busy = workspaceLoading || loading;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Studio éditorial · données réelles"
        title="Publications"
        description="Générez, vérifiez les faits locaux, approuvez humainement puis programmez via Postiz. Aucune publication n’est envoyée sans validation."
        action={
          canEditPosts ? (
            <Button onClick={() => void generatePosts()} disabled={mutating || Boolean(campaignId)}>
              {campaignId ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              {campaignId ? "Génération en cours…" : "Générer 5 publications"}
            </Button>
          ) : (
            <Badge tone="slate">Rôle · {workspace?.role ?? "—"}</Badge>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone="green">Espace réel · {workspace?.brandName ?? "YokoSushi"}</Badge>
        <Badge tone={providerMode === "real" ? "blue" : "amber"}>
          Postiz {providerMode === "real" ? "réel" : "mock"}
        </Badge>
        {publicationPollInterval && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <RefreshCw className="size-3.5 animate-spin" /> Suivi toutes les{" "}
            {pollingIntervalLabel(publicationPollInterval)}
          </span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 p-6 text-white shadow-lg">
        <div className="max-w-xl">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
            <Sparkles className="size-4 animate-pulse" /> Autopilote Éditorial IA · Qualité Ultra Pro
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Vos 5 publications de la semaine générées par OpenAI
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Légendes captivantes spécialisées gastronomie japonaise, association automatique avec vos meilleures photos et programmation uniforme sur la semaine.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            onClick={() => void generatePosts()}
            disabled={mutating || Boolean(campaignId)}
            className="bg-rose-500 font-bold text-white hover:bg-rose-600 shadow-md"
          >
            {campaignId ? (
              <LoaderCircle className="size-5 animate-spin mr-2" />
            ) : (
              <WandSparkles className="size-5 mr-2" />
            )}
            {campaignId ? "Génération OpenAI en cours…" : "✨ Générer la semaine"}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => void approveAndScheduleAllPosts()}
            disabled={mutating || posts.length === 0}
            className="bg-white/10 font-bold text-white hover:bg-white/20 border border-white/20"
          >
            <CheckCircle2 className="size-5 mr-2 text-emerald-400" /> Tout valider (1 clic)
          </Button>
        </div>
      </div>

      {(workspaceError || error) && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{workspaceError ?? error}</span>
          {workspaceError && (
            <Button size="sm" variant="secondary" onClick={() => void refresh()}>
              Réessayer
            </Button>
          )}
        </div>
      )}
      {notice && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {workspace && canEditPosts && (
        <Card className="mb-5">
          <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-slate-900">Contexte des 5 propositions</p>
              <p className="mt-1 text-xs text-slate-500">
                Seuls les produits, médias et établissements déjà validés seront transmis au moteur
                de génération.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <fieldset>
                  <legend className="text-xs font-semibold text-slate-700">Réseaux</legend>
                  <div className="mt-2 flex gap-2">
                    {(["instagram", "facebook"] as const).map((platform) => (
                      <button
                        key={platform}
                        type="button"
                        onClick={() =>
                          setGenerationPlatforms((current) =>
                            current.includes(platform)
                              ? current.filter((item) => item !== platform)
                              : [...current, platform]
                          )
                        }
                        className={cn(
                          "rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                          generationPlatforms.includes(platform)
                            ? "bg-slate-950 text-white ring-slate-950"
                            : "bg-white text-slate-600 ring-slate-200"
                        )}
                      >
                        {platform === "instagram" ? "Instagram" : "Facebook"}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-xs font-semibold text-slate-700">
                    Établissements (vide = marque entière)
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {approvedEstablishments.map((establishment) => (
                      <button
                        key={establishment.id}
                        type="button"
                        onClick={() =>
                          setGenerationEstablishments((current) =>
                            current.includes(establishment.id)
                              ? current.filter((id) => id !== establishment.id)
                              : [...current, establishment.id]
                          )
                        }
                        className={cn(
                          "rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                          generationEstablishments.includes(establishment.id)
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : "bg-white text-slate-600 ring-slate-200"
                        )}
                      >
                        {establishment.name}
                      </button>
                    ))}
                    {approvedEstablishments.length === 0 && (
                      <span className="text-xs text-amber-700">Aucun établissement validé.</span>
                    )}
                  </div>
                </fieldset>
              </div>
            </div>
            <Button
              variant="secondary"
              disabled={mutating || Boolean(campaignId) || generationPlatforms.length === 0}
              onClick={() => void generatePosts()}
            >
              <Sparkles className="size-4" /> Lancer le worker
            </Button>
          </CardContent>
        </Card>
      )}

      {busy ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin" /> Chargement de l’espace éditorial réel…
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ImageIcon className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 text-lg font-semibold">Aucune publication réelle</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
              Validez au moins un produit et un média après l’import, puis générez cinq
              propositions.
            </p>
            <Button asChild className="mt-5" variant="secondary">
              <Link href="/import">Ouvrir l’import réel</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
          <Card className="h-fit overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <p className="text-sm font-semibold">{posts.length} publication(s)</p>
              <p className="mt-1 text-xs text-slate-500">Cliquez pour modifier et valider.</p>
            </div>
            <div className="max-h-[760px] divide-y divide-slate-100 overflow-y-auto">
              {posts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setSelectedId(post.id)}
                  className={cn(
                    "w-full p-4 text-left transition hover:bg-slate-50",
                    selectedPost?.id === post.id && "bg-rose-50/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={statusTone(post.status)}>{statusLabels[post.status]}</Badge>
                    <ChevronRight className="size-4 text-slate-300" />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">
                    {post.title}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {post.platforms.join(" + ")} · {post.format}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          {selectedPost && form && (
            <div className="space-y-5">
              {contentReadOnly && (
                <Card>
                  <CardContent className="flex items-start gap-3 p-5 text-sm text-slate-600">
                    <Clock3 className="mt-0.5 size-5 shrink-0 text-slate-400" />
                    <div>
                      <p className="font-semibold text-slate-900">Version en lecture seule</p>
                      <p className="mt-1">
                        {!canEditPosts
                          ? `Le rôle ${workspace?.role ?? "courant"} ne permet pas de modifier les contenus.`
                          : `Cette publication est ${statusLabels[selectedPost.status].toLocaleLowerCase("fr")}. Son contenu ne peut plus être modifié dans cet état.`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {!contentReadOnly && (
                <Card>
                  <CardContent className="space-y-5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Version éditable</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Une sauvegarde ramène toujours cette publication en brouillon.
                        </p>
                      </div>
                      <Badge tone={statusTone(selectedPost.status)}>
                        {statusLabels[selectedPost.status]}
                      </Badge>
                    </div>

                    <label>
                      <FormLabel>Titre interne</FormLabel>
                      <input
                        value={form.title}
                        maxLength={120}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        className={fieldClass}
                      />
                    </label>
                    <label>
                      <FormLabel>Objectif</FormLabel>
                      <input
                        value={form.objective}
                        maxLength={240}
                        onChange={(event) => setForm({ ...form, objective: event.target.value })}
                        className={fieldClass}
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <FormLabel>Format</FormLabel>
                        <select
                          value={form.format}
                          onChange={(event) =>
                            setForm({ ...form, format: event.target.value as PostForm["format"] })
                          }
                          className={fieldClass}
                        >
                          {Object.entries(formatLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <FormLabel>Thème</FormLabel>
                        <select
                          value={form.topic}
                          onChange={(event) =>
                            setForm({ ...form, topic: event.target.value as PostForm["topic"] })
                          }
                          className={fieldClass}
                        >
                          {Object.entries(topicLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <fieldset>
                      <legend className="text-xs font-semibold text-slate-700">Réseaux</legend>
                      <div className="mt-2 flex gap-2">
                        {(["instagram", "facebook"] as const).map((platform) => (
                          <button
                            key={platform}
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                platforms: form.platforms.includes(platform)
                                  ? form.platforms.filter((item) => item !== platform)
                                  : [...form.platforms, platform]
                              })
                            }
                            className={cn(
                              "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                              form.platforms.includes(platform)
                                ? "bg-slate-950 text-white ring-slate-950"
                                : "bg-white text-slate-600 ring-slate-200"
                            )}
                          >
                            {platform === "instagram" ? (
                              <Instagram className="size-4" />
                            ) : (
                              <Facebook className="size-4" />
                            )}
                            {platform === "instagram" ? "Instagram" : "Facebook"}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    {form.platforms.includes("instagram") && (
                      <label>
                        <FormLabel>Légende Instagram</FormLabel>
                        <textarea
                          rows={6}
                          maxLength={2_200}
                          value={form.instagramCaption}
                          onChange={(event) =>
                            setForm({ ...form, instagramCaption: event.target.value })
                          }
                          className={fieldClass}
                        />
                      </label>
                    )}
                    {form.platforms.includes("facebook") && (
                      <label>
                        <FormLabel>Légende Facebook</FormLabel>
                        <textarea
                          rows={6}
                          maxLength={5_000}
                          value={form.facebookCaption}
                          onChange={(event) =>
                            setForm({ ...form, facebookCaption: event.target.value })
                          }
                          className={fieldClass}
                        />
                      </label>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <FormLabel>Appel à l’action</FormLabel>
                        <input
                          value={form.callToAction}
                          maxLength={180}
                          onChange={(event) =>
                            setForm({ ...form, callToAction: event.target.value })
                          }
                          className={fieldClass}
                        />
                      </label>
                      <label>
                        <FormLabel>Hashtags (12 maximum)</FormLabel>
                        <input
                          value={form.hashtags}
                          onChange={(event) => setForm({ ...form, hashtags: event.target.value })}
                          placeholder="#YokoSushi #Sushi"
                          className={fieldClass}
                        />
                      </label>
                    </div>

                    <fieldset>
                      <legend className="text-xs font-semibold text-slate-700">
                        Établissements (aucun = communication de marque)
                      </legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {approvedEstablishments.map((establishment) => (
                          <button
                            key={establishment.id}
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                establishmentIds: form.establishmentIds.includes(establishment.id)
                                  ? form.establishmentIds.filter((id) => id !== establishment.id)
                                  : [...form.establishmentIds, establishment.id]
                              })
                            }
                            className={cn(
                              "rounded-xl px-3 py-2 text-xs font-semibold ring-1",
                              form.establishmentIds.includes(establishment.id)
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : "bg-white text-slate-600 ring-slate-200"
                            )}
                          >
                            {establishment.name}
                            {establishment.city ? ` · ${establishment.city}` : ""}
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="text-xs font-semibold text-slate-700">
                        Médias validés · {form.mediaAssetIds.length} sélectionné(s)
                      </legend>
                      {mediaPagination.pages > 1 && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Les 100 médias les plus récents sont proposés ici sur un total de{" "}
                          {mediaPagination.total}. La médiathèque permet de retrouver les autres.
                        </p>
                      )}
                      <div className="mt-2 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-xl bg-slate-50 p-2 sm:grid-cols-4">
                        {approvedMedia.map((asset) => {
                          const checked = form.mediaAssetIds.includes(asset.id);
                          return (
                            <button
                              key={asset.id}
                              type="button"
                              title={mediaTitle(asset)}
                              onClick={() =>
                                setForm({
                                  ...form,
                                  mediaAssetIds: checked
                                    ? form.mediaAssetIds.filter((id) => id !== asset.id)
                                    : [...form.mediaAssetIds, asset.id]
                                })
                              }
                              className={cn(
                                "relative aspect-square overflow-hidden rounded-lg bg-slate-200 ring-2 ring-transparent",
                                checked && "ring-rose-500"
                              )}
                            >
                              <img
                                src={(asset.publicUrl ?? asset.sourceUrl) || undefined}
                                alt={asset.altText ?? mediaTitle(asset)}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  if (asset.sourceUrl && e.currentTarget.src !== asset.sourceUrl) {
                                    e.currentTarget.src = asset.sourceUrl;
                                  }
                                }}
                              />
                              {checked && (
                                <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-rose-500 text-white">
                                  <Check className="size-3" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                        {approvedMedia.length === 0 && (
                          <p className="col-span-full p-4 text-center text-xs text-slate-500">
                            Aucun média approuvé avec URL publique. Validez l’import dans la
                            médiathèque.
                          </p>
                        )}
                      </div>
                    </fieldset>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        <FormLabel>Date et heure (fuseau du navigateur)</FormLabel>
                        <input
                          type="datetime-local"
                          value={form.scheduledAt}
                          onChange={(event) =>
                            setForm({ ...form, scheduledAt: event.target.value })
                          }
                          className={fieldClass}
                        />
                      </label>
                      <label>
                        <FormLabel>Note interne de version</FormLabel>
                        <input
                          value={form.internalNote}
                          maxLength={2_000}
                          onChange={(event) =>
                            setForm({ ...form, internalNote: event.target.value })
                          }
                          placeholder="Modification effectuée…"
                          className={fieldClass}
                        />
                      </label>
                    </div>

                    <Button className="w-full" onClick={() => void savePost()} disabled={mutating}>
                      {mutating ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Sauvegarder en brouillon
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <p className="text-sm font-semibold">Validation humaine</p>
                    <p className="mt-1 text-xs text-slate-500">
                      La programmation n’est disponible qu’après approbation explicite de la version
                      courante.
                    </p>
                  </div>
                  {dirty && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      Des changements ne sont pas sauvegardés : sauvegardez d’abord pour soumettre,
                      approuver ou programmer la version affichée.
                    </div>
                  )}
                  {canEditPosts && selectedPost.status === "DRAFT" && (
                    <Button
                      className="w-full"
                      onClick={() => void transition("submit")}
                      disabled={mutating}
                    >
                      <Send className="size-4" /> Soumettre pour validation
                    </Button>
                  )}
                  {canReviewPosts && selectedPost.status === "PENDING_REVIEW" && (
                    <div className="space-y-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button onClick={() => void transition("approve")} disabled={mutating}>
                          <Check className="size-4" /> Approuver
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void transition("reject")}
                          disabled={mutating}
                        >
                          <X className="size-4" /> Refuser
                        </Button>
                      </div>
                      <select
                        value={rejectionReason}
                        onChange={(event) =>
                          setRejectionReason(event.target.value as keyof typeof rejectionReasons)
                        }
                        className={fieldClass}
                        aria-label="Motif de refus"
                      >
                        {Object.entries(rejectionReasons).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={3}
                        value={rejectionNote}
                        onChange={(event) => setRejectionNote(event.target.value)}
                        placeholder="Note facultative pour la prochaine génération"
                        className={fieldClass}
                      />
                    </div>
                  )}
                  {canEditPosts && selectedPost.status === "REJECTED" && (
                    <Button
                      className="w-full"
                      variant="secondary"
                      onClick={() => void transition("reopen")}
                      disabled={mutating}
                    >
                      <RefreshCw className="size-4" /> Reprendre en brouillon
                    </Button>
                  )}
                  {canEditPosts && selectedPost.status === "APPROVED" && (
                    <div className="space-y-4">
                      {selectedPost.format === "IMAGE" || selectedPost.format === "CAROUSEL" ? (
                        <>
                          {selectedPost.platforms.map((platform) => {
                            const eligible = accounts.filter(
                              (account) =>
                                account.platform === platform &&
                                isProgrammableSocialAccount(account) &&
                                (!account.establishmentId ||
                                  form.establishmentIds.length === 0 ||
                                  form.establishmentIds.includes(account.establishmentId))
                            );
                            return (
                              <label key={platform}>
                                <FormLabel>
                                  Compte {platform === "INSTAGRAM" ? "Instagram" : "Facebook"}
                                </FormLabel>
                                <select
                                  value={accountByPlatform[platform] ?? ""}
                                  onChange={(event) =>
                                    setAccountByPlatform((current) => ({
                                      ...current,
                                      [platform]: event.target.value
                                    }))
                                  }
                                  className={fieldClass}
                                >
                                  <option value="">Choisir un compte connecté</option>
                                  {eligible.map((account) => (
                                    <option key={account.id} value={account.id}>
                                      {account.displayName}
                                      {account.username ? ` · ${account.username}` : ""}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                          <Button
                            className="w-full"
                            onClick={() => void schedulePost()}
                            disabled={mutating}
                          >
                            <Clock3 className="size-4" /> Programmer via Postiz {providerMode}
                          </Button>
                        </>
                      ) : (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Le MVP conserve les Stories et Reels comme scripts validés. Seuls les
                          formats image et carrousel peuvent être programmés via Postiz.
                        </div>
                      )}
                    </div>
                  )}
                  {canEditPosts &&
                    ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"].includes(
                      selectedPost.status
                    ) && (
                      <Button
                        className="w-full"
                        variant="ghost"
                        onClick={() => void transition("cancel")}
                        disabled={mutating}
                      >
                        Annuler définitivement
                      </Button>
                    )}
                  {selectedPost.publicationJobs && selectedPost.publicationJobs.length > 0 && (
                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700">
                          Tâches de publication
                        </p>
                        {canEditPosts &&
                          selectedPost.status === "SCHEDULED" &&
                          selectedPost.publicationJobs.some((job) => job.status === "PENDING") && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void requeuePendingPublicationJobs()}
                              disabled={mutating}
                            >
                              {mutating ? (
                                <LoaderCircle className="size-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                              Remettre les tâches en file
                            </Button>
                          )}
                      </div>
                      {selectedPost.publicationJobs.map((job) => (
                        <div key={job.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{job.socialAccount.displayName}</span>
                            <Badge
                              tone={
                                job.status === "FAILED"
                                  ? "rose"
                                  : job.status === "PUBLISHED"
                                    ? "green"
                                    : "blue"
                              }
                            >
                              {job.status}
                            </Badge>
                          </div>
                          {job.lastErrorMessage && (
                            <p className="mt-2 text-red-700">{job.lastErrorMessage}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {selectedPost && form && (
            <div className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
              <p className="text-xs font-bold tracking-[0.14em] text-slate-400 uppercase">
                Aperçus mobiles
              </p>
              {form.platforms.includes("instagram") && (
                <SocialPreview
                  platform="instagram"
                  caption={form.instagramCaption}
                  hashtags={parseHashtags(form.hashtags)}
                  assets={selectedMedia}
                />
              )}
              {form.platforms.includes("facebook") && (
                <SocialPreview
                  platform="facebook"
                  caption={form.facebookCaption}
                  hashtags={[]}
                  assets={selectedMedia}
                />
              )}
              {selectedPost.warnings && selectedPost.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4" /> Points à vérifier
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {selectedPost.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function SocialPreview({
  platform,
  caption,
  hashtags,
  assets
}: {
  platform: EditablePlatform;
  caption: string;
  hashtags: string[];
  assets: RealMediaAsset[];
}) {
  const Icon = platform === "instagram" ? Instagram : Facebook;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <span className="grid size-8 place-items-center rounded-full bg-slate-950 text-white">
          <Icon className="size-4" />
        </span>
        <div>
          <p className="text-xs font-semibold">YokoSushi</p>
          <p className="text-[10px] text-slate-400">
            Aperçu {platform === "instagram" ? "Instagram" : "Facebook"}
          </p>
        </div>
      </div>
      {assets[0]?.publicUrl || assets[0]?.sourceUrl ? (
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <img
            src={(assets[0].publicUrl ?? assets[0].sourceUrl) || undefined}
            alt={assets[0].altText ?? mediaTitle(assets[0])}
            className="h-full w-full object-cover"
            onError={(e) => {
              const fallback = assets[0]?.sourceUrl;
              if (fallback && e.currentTarget.src !== fallback) {
                e.currentTarget.src = fallback;
              }
            }}
          />
          {assets.length > 1 && (
            <Badge className="absolute top-3 right-3 bg-white/90">1/{assets.length}</Badge>
          )}
        </div>
      ) : (
        <div className="grid aspect-square place-items-center bg-slate-100 text-slate-300">
          <ImageIcon className="size-10" />
        </div>
      )}
      <div className="p-4 text-xs leading-5 text-slate-700">
        <p className="whitespace-pre-wrap">{caption || "La légende apparaîtra ici."}</p>
        {hashtags.length > 0 && <p className="mt-2 text-blue-600">{hashtags.join(" ")}</p>}
      </div>
    </Card>
  );
}
