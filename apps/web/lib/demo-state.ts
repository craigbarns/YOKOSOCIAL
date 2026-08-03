import type { GeneratedPost, Platform, SocialPostStatus } from "@yokosocial/shared";

export type DemoUser = { name: string; email: string };
export type DemoOrganization = { name: string; websiteUrl: string };

export type ImportStep =
  | "idle"
  | "connecting"
  | "pages"
  | "establishments"
  | "products"
  | "images"
  | "quality"
  | "duplicates"
  | "preview";

export type DemoImportSummary = {
  pagesScanned: number;
  establishmentsDetected: number;
  productsDetected: number;
  categoriesDetected: number;
  imagesDetected: number;
  imagesRetained: number;
  duplicatesDetected: number;
  smallImages: number;
  errorsCount: number;
  validationRequired: number;
  demo: true;
};

export type DemoPost = GeneratedPost & {
  id: string;
  status: SocialPostStatus;
  scheduledAt?: string;
  remotePostId?: string;
  providerMessage?: string;
};

export type DemoState = {
  version: 1;
  hydrated: boolean;
  user?: DemoUser;
  organization?: DemoOrganization;
  import: {
    running: boolean;
    step: ImportStep;
    progress: number;
    summary?: DemoImportSummary;
    selectedProductIds: string[];
    selectedMediaIds: string[];
    confirmed: boolean;
  };
  posts: DemoPost[];
};

export const emptyDemoState: DemoState = {
  version: 1,
  hydrated: false,
  import: {
    running: false,
    step: "idle",
    progress: 0,
    selectedProductIds: [],
    selectedMediaIds: [],
    confirmed: false
  },
  posts: []
};

export type PostPatch = Partial<
  Pick<
    DemoPost,
    | "instagramCaption"
    | "facebookCaption"
    | "callToAction"
    | "hashtags"
    | "platforms"
    | "establishmentIds"
    | "mediaAssetIds"
    | "suggestedAt"
    | "scheduledAt"
  >
>;

export function normalizePlatforms(platforms: Platform[]): Platform[] {
  return [...new Set(platforms)];
}
