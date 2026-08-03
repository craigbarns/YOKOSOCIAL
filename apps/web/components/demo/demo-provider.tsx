"use client";

import {
  canTransitionPost,
  demoMedia,
  demoProducts,
  type SocialPostStatus
} from "@yokosocial/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  emptyDemoState,
  type DemoImportSummary,
  type DemoOrganization,
  type DemoPost,
  type DemoState,
  type DemoUser,
  normalizePlatforms,
  type PostPatch
} from "@/lib/demo-state";

const storageKey = "yokosocial-demo-state-v1";

type DemoContextValue = {
  state: DemoState;
  register: (user: DemoUser) => Promise<void>;
  login: (user: DemoUser) => Promise<void>;
  createOrganization: (organization: DemoOrganization) => void;
  startImport: () => Promise<void>;
  toggleProduct: (id: string) => void;
  toggleMedia: (id: string) => void;
  confirmImport: () => void;
  generatePosts: () => Promise<void>;
  updatePost: (id: string, patch: PostPatch) => void;
  transitionPost: (id: string, status: SocialPostStatus) => void;
  schedulePost: (id: string, scenario?: "success" | "error") => Promise<void>;
  resetDemo: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(emptyDemoState);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setState((current) => ({ ...current, hydrated: true }));
      return;
    }
    try {
      const parsed = JSON.parse(stored) as DemoState;
      setState({ ...parsed, hydrated: true });
    } catch {
      window.localStorage.removeItem(storageKey);
      setState((current) => ({ ...current, hydrated: true }));
    }
  }, []);

  useEffect(() => {
    if (state.hydrated) window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const createSession = useCallback(async (user: DemoUser) => {
    const response = await fetch("/api/demo/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user)
    });
    if (!response.ok) throw new Error("Impossible d’ouvrir la session de démonstration.");
  }, []);

  const login = useCallback(
    async (user: DemoUser) => {
      await createSession(user);
      setState((current) => ({ ...current, user }));
    },
    [createSession]
  );

  const register = login;

  const createOrganization = useCallback((organization: DemoOrganization) => {
    setState((current) => ({ ...current, organization }));
  }, []);

  const startImport = useCallback(async () => {
    setState((current) => ({
      ...current,
      import: { ...current.import, running: true, step: "connecting", progress: 7 }
    }));

    const responsePromise = fetch("/api/demo/import", { method: "POST" });
    const steps = [
      ["pages", 22],
      ["establishments", 35],
      ["products", 50],
      ["images", 66],
      ["quality", 78],
      ["duplicates", 90],
      ["preview", 98]
    ] as const;

    for (const [step, progress] of steps) {
      await delay(160);
      setState((current) => ({
        ...current,
        import: { ...current.import, step, progress }
      }));
    }

    const response = await responsePromise;
    if (!response.ok) {
      setState((current) => ({
        ...current,
        import: { ...current.import, running: false, step: "idle", progress: 0 }
      }));
      throw new Error("La simulation d’import a échoué.");
    }
    const summary = (await response.json()) as DemoImportSummary;
    setState((current) => ({
      ...current,
      import: {
        ...current.import,
        running: false,
        step: "preview",
        progress: 100,
        summary,
        selectedProductIds: demoProducts.map((product) => product.id),
        selectedMediaIds: demoMedia
          .filter((media) => media.status !== "NEEDS_REVIEW")
          .map((media) => media.id)
      }
    }));
  }, []);

  const toggleProduct = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      import: {
        ...current.import,
        selectedProductIds: current.import.selectedProductIds.includes(id)
          ? current.import.selectedProductIds.filter((item) => item !== id)
          : [...current.import.selectedProductIds, id]
      }
    }));
  }, []);

  const toggleMedia = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      import: {
        ...current.import,
        selectedMediaIds: current.import.selectedMediaIds.includes(id)
          ? current.import.selectedMediaIds.filter((item) => item !== id)
          : [...current.import.selectedMediaIds, id]
      }
    }));
  }, []);

  const confirmImport = useCallback(() => {
    setState((current) => ({
      ...current,
      import: { ...current.import, confirmed: true }
    }));
  }, []);

  const generatePosts = useCallback(async () => {
    const response = await fetch("/api/demo/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        establishmentIds: ["demo-establishment-compans", "demo-establishment-peri"],
        platforms: ["instagram", "facebook"]
      })
    });
    if (!response.ok) throw new Error("La génération de démonstration a échoué.");
    const payload = (await response.json()) as { posts: DemoPost[] };
    setState((current) => ({ ...current, posts: payload.posts }));
  }, []);

  const updatePost = useCallback((id: string, patch: PostPatch) => {
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) =>
        post.id === id
          ? {
              ...post,
              ...patch,
              ...(patch.platforms ? { platforms: normalizePlatforms(patch.platforms) } : {}),
              status: post.status === "APPROVED" ? "DRAFT" : post.status
            }
          : post
      )
    }));
  }, []);

  const transitionPost = useCallback((id: string, status: SocialPostStatus) => {
    setState((current) => ({
      ...current,
      posts: current.posts.map((post) => {
        if (post.id !== id) return post;
        if (!canTransitionPost(post.status, status)) {
          throw new Error(`Transition impossible : ${post.status} → ${status}`);
        }
        return { ...post, status };
      })
    }));
  }, []);

  const schedulePost = useCallback(
    async (id: string, scenario: "success" | "error" = "success") => {
      const post = state.posts.find((item) => item.id === id);
      if (!post || post.status !== "APPROVED") {
        throw new Error("La publication doit être approuvée avant programmation.");
      }
      const scheduledAt = post.scheduledAt ?? post.suggestedAt;
      if (!scheduledAt) throw new Error("Choisissez une date de programmation.");

      const response = await fetch("/api/demo/postiz/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post, scenario, scheduledAt })
      });
      const payload = (await response.json()) as {
        status: "SCHEDULED" | "FAILED";
        remotePostId?: string;
        message: string;
      };
      setState((current) => ({
        ...current,
        posts: current.posts.map((item) =>
          item.id === id
            ? {
                ...item,
                status: payload.status,
                scheduledAt,
                ...(payload.remotePostId ? { remotePostId: payload.remotePostId } : {}),
                providerMessage: payload.message
              }
            : item
        )
      }));
    },
    [state.posts]
  );

  const resetDemo = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    void fetch("/api/demo/session", { method: "DELETE" });
    setState({ ...emptyDemoState, hydrated: true });
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      state,
      register,
      login,
      createOrganization,
      startImport,
      toggleProduct,
      toggleMedia,
      confirmImport,
      generatePosts,
      updatePost,
      transitionPost,
      schedulePost,
      resetDemo
    }),
    [
      state,
      register,
      login,
      createOrganization,
      startImport,
      toggleProduct,
      toggleMedia,
      confirmImport,
      generatePosts,
      updatePost,
      transitionPost,
      schedulePost,
      resetDemo
    ]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo doit être utilisé dans DemoProvider.");
  return context;
}
