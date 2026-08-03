import type { GeneratedPost, Platform } from "@yokosocial/shared";

export type BrandGrounding = {
  id: string;
  name: string;
  tone: string[];
  guidelines: string;
  forbiddenPhrases: string[];
  languages: string[];
};

export type EstablishmentGrounding = {
  id: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  openingHours?: string[];
  services?: string[];
  validatedFields: string[];
};

export type ProductGrounding = {
  id: string;
  name: string;
  category: string;
  description?: string;
  price?: string | null;
  establishmentIds: string[];
  validated: boolean;
  demo?: boolean;
};

export type MediaGrounding = {
  id: string;
  title: string;
  category: string;
  qualityScore: number;
  status: string;
  establishmentIds: string[];
  productId?: string;
  usageCount: number;
};

export type GenerationRequest = {
  organizationId: string;
  brand: BrandGrounding;
  establishments: EstablishmentGrounding[];
  products: ProductGrounding[];
  media: MediaGrounding[];
  platforms: Platform[];
  establishmentIds: string[];
  count: number;
  startDate: string;
  preferredTopics?: string[];
  previousPosts?: Array<Pick<GeneratedPost, "topic" | "callToAction" | "mediaAssetIds">>;
  feedback?: string[];
  demoMode: boolean;
};

export interface ContentGenerationProvider {
  readonly name: string;
  generate(request: GenerationRequest): Promise<unknown>;
}

export type GenerationResult = {
  posts: GeneratedPost[];
  rejectedCount: number;
  globalWarnings: string[];
};
