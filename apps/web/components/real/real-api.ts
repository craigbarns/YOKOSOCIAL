"use client";

export type RealPlatform = "INSTAGRAM" | "FACEBOOK";
export type EditablePlatform = "instagram" | "facebook";
export type RealPostStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type RealEstablishment = {
  id: string;
  name: string;
  city: string | null;
  slug?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  countryCode?: string;
  phone?: string | null;
  businessHours?: Record<string, unknown> | null;
  services?: string[];
  orderUrl?: string | null;
  reservationUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  sourceUrl?: string | null;
  status: string;
  validationStatus: string;
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type RealMediaAsset = {
  id: string;
  originalName?: string;
  detectedTitle?: string | null;
  title?: string;
  description?: string | null;
  altText?: string | null;
  publicUrl: string | null;
  sourceUrl?: string | null;
  sourcePageUrl?: string | null;
  mimeType?: string;
  width: number | null;
  height: number | null;
  qualityScore: number;
  instagramPotentialScore?: number;
  facebookPotentialScore?: number;
  storyPotentialScore?: number;
  carouselPotentialScore?: number;
  reelPotentialScore?: number;
  potentialScores?: {
    instagram: number;
    facebook: number;
    story: number;
    carousel: number;
    reel: number;
  };
  category?: string;
  editorialCategory: string;
  status: string;
  usageCount?: number;
  lastUsedAt?: string | null;
  importedAt?: string;
  menuItem?: { id: string; name: string } | null;
  establishmentLinks?: Array<{
    establishment?: { id: string; name: string; city?: string | null };
  }>;
  establishments?: Array<{
    id: string;
    name: string;
    city?: string | null;
    validated?: boolean;
  }>;
};

export type RealPostMedia = {
  id?: string;
  sortOrder: number;
  mediaAsset: RealMediaAsset;
  mediaVariant?: {
    id: string;
    publicUrl: string | null;
    mimeType: string;
    width: number;
    height: number;
  } | null;
};

export type RealPublicationJob = {
  id: string;
  status: string;
  provider: string;
  platform: RealPlatform;
  scheduledAt: string;
  attemptsCount: number;
  lastErrorMessage: string | null;
  socialAccount: {
    id: string;
    platform: RealPlatform;
    displayName: string;
    username: string | null;
  };
};

export type RealPost = {
  id: string;
  title: string;
  objective: string;
  platforms: RealPlatform[];
  format: "IMAGE" | "CAROUSEL" | "STORY" | "REEL";
  topic:
    | "PRODUCT"
    | "PLATTER"
    | "RESTAURANT"
    | "AMBIANCE"
    | "PROMOTION"
    | "DELIVERY"
    | "BEHIND_THE_SCENES"
    | "TEAM"
    | "SEASONAL"
    | "LOCAL";
  instagramCaption: string | null;
  facebookCaption: string | null;
  callToAction: string;
  hashtags: string[];
  rationale?: string | null;
  warnings?: string[];
  status: RealPostStatus;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string | null;
  rejectionNote?: string | null;
  establishmentLinks: Array<{
    establishmentId?: string;
    establishment: { id: string; name: string; city?: string | null };
  }>;
  media: RealPostMedia[];
  publicationJobs?: RealPublicationJob[];
};

export type RealSocialAccount = {
  id: string;
  establishmentId: string | null;
  platform: RealPlatform;
  displayName: string;
  username: string | null;
  remoteIntegrationId: string | null;
  status: "DISCONNECTED" | "CONNECTED" | "EXPIRED" | "ERROR";
  lastSyncedAt: string | null;
  metadata?: unknown;
};

export type RealProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string | number | null;
  currency: string;
  allergens?: string[];
  confidence?: number;
  validationStatus: string;
  status: string;
  sourceUrl?: string | null;
  sources?: { productUrl: string | null; pageUrl: string | null };
  category?: { id?: string; name: string } | null;
  establishmentLinks?: Array<{
    available?: boolean;
    localPrice?: string | number | null;
    establishment?: { id: string; name: string; city?: string | null };
  }>;
  establishments?: Array<{
    id: string;
    name: string;
    city?: string | null;
    available?: boolean;
    localPrice?: string | number | null;
    orderUrl?: string | null;
    sourceUrl?: string | null;
    validationStatus?: string;
  }>;
  recommendedMedia?: {
    id: string;
    publicUrl: string | null;
    width?: number | null;
    height?: number | null;
    qualityScore?: number;
    status?: string;
  } | null;
};

export type RealCampaign = {
  id: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  posts: RealPost[];
};

export type RealBrandProfile = {
  id: string;
  brandId: string;
  logoMediaAssetId: string | null;
  slogan: string | null;
  story: string | null;
  cuisineType: string | null;
  positioning: string | null;
  targetAudience: string | null;
  geographicArea: string | null;
  priceRange: string | null;
  tones: Array<
    | "PREMIUM"
    | "GOURMAND"
    | "WARM"
    | "TRENDY"
    | "FAMILY"
    | "MODERN"
    | "DYNAMIC"
    | "HUMOROUS"
    | "SOBER"
  >;
  colors: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  allowedExpressions: string[];
  wordsToAvoid: string[];
  allowedEmojis: string[];
  emojiUsageLevel: number;
  languages: string[];
  orderLinks: Record<string, string> | null;
  socialPlatforms: RealPlatform[];
  customInstruction: string | null;
  createdAt: string;
  updatedAt: string;
  logo: {
    id: string;
    publicUrl: string | null;
    altText: string | null;
    width: number | null;
    height: number | null;
    mimeType: string;
    status: string;
  } | null;
};

export class RealApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "RealApiError";
  }
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new RealApiError(payload.error ?? "L’opération n’a pas abouti.", response.status);
  }
  return payload;
}

export function mediaItems(payload: {
  media?: RealMediaAsset[];
  mediaAssets?: RealMediaAsset[];
}): RealMediaAsset[] {
  return payload.media ?? payload.mediaAssets ?? [];
}

export function productItems(payload: {
  products?: RealProduct[];
  menuItems?: RealProduct[];
}): RealProduct[] {
  return payload.products ?? payload.menuItems ?? [];
}

export function mediaUrl(item: RealPostMedia): string | null {
  return item.mediaVariant?.publicUrl ?? item.mediaAsset.publicUrl;
}

export function mediaTitle(item: RealMediaAsset): string {
  return item.title ?? item.detectedTitle ?? item.originalName ?? "Média sans titre";
}

export function toEditablePlatform(platform: RealPlatform): EditablePlatform {
  return platform === "INSTAGRAM" ? "instagram" : "facebook";
}

export function toRealPlatform(platform: EditablePlatform): RealPlatform {
  return platform === "instagram" ? "INSTAGRAM" : "FACEBOOK";
}
