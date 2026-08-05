import { fal } from "@fal-ai/client";

// Type simple plutôt que schéma zod : cette configuration n’est jamais validée à
// l’exécution, le schéma ne servait qu’à dériver un type via `z.infer`.
type FalVideoConfig = {
  apiKey: string;
};

export interface ReelGenerationParams {
  productName: string;
  description: string;
  imageUrl: string;
  style: "appetizing" | "fast-paced" | "zen" | "luxury";
  duration?: "5s" | "10s";
  cuisine?: string;
}

export interface ReelResult {
  videoUrl: string;
  status: "completed" | "failed";
  metadata?: Record<string, unknown>;
}

export class FalVideoProvider {
  private initialized = false;

  constructor(private config: FalVideoConfig) {}

  private ensureInitialized() {
    if (this.initialized) return;
    fal.config({ credentials: this.config.apiKey });
    this.initialized = true;
  }

  async generateReel(params: ReelGenerationParams): Promise<ReelResult> {
    this.ensureInitialized();
    const prompt = this.buildPrompt(params);

    try {
      const result = await fal.subscribe("fal-ai/kling-video/v1.6/standard", {
        input: {
          prompt,
          image_url: params.imageUrl,
          duration: params.duration || "5s",
          aspect_ratio: "9:16"
        },
        logs: true
      });

      const videoUrl = (result.data as { video?: { url?: string } })?.video?.url || "";
      return {
        videoUrl,
        status: "completed",
        metadata: {
          prompt
        }
      };
    } catch (error) {
      console.error("[FalVideoProvider] Generation failed:", error);
      return {
        videoUrl: "",
        status: "failed",
        metadata: { error: (error as Error).message }
      };
    }
  }

  async generateStory(params: ReelGenerationParams): Promise<ReelResult> {
    this.ensureInitialized();
    const prompt = this.buildPrompt(params);

    try {
      const result = await fal.subscribe("fal-ai/kling-video/v1.6/standard", {
        input: {
          prompt,
          image_url: params.imageUrl,
          duration: "5s",
          aspect_ratio: "9:16"
        }
      });

      const videoUrl = (result.data as { video?: { url?: string } })?.video?.url || "";
      return {
        videoUrl,
        status: "completed",
        metadata: { prompt }
      };
    } catch (error) {
      return {
        videoUrl: "",
        status: "failed",
        metadata: { error: (error as Error).message }
      };
    }
  }

  private buildPrompt(params: ReelGenerationParams): string {
    const stylePrompts: Record<string, string> = {
      appetizing: "close-up food cinematography, steam rising, glistening textures, warm golden lighting",
      "fast-paced": "dynamic food preparation, quick cuts energy, sizzling wok, busy kitchen atmosphere",
      zen: "minimalist japanese aesthetic, clean lines, soft natural light, serene plating",
      luxury: "premium dining experience, elegant table setting, cinematic depth of field, sophisticated ambiance"
    };

    return `Professional food video for Instagram Reels. ${stylePrompts[params.style] || stylePrompts.appetizing}. ${params.description}. ${params.cuisine ? `Authentic ${params.cuisine} cuisine.` : ""} High quality, 1080p, smooth camera movement.`;
  }
}

export function createFalVideoProvider(): FalVideoProvider {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_KEY is not configured");
  return new FalVideoProvider({ apiKey });
}
