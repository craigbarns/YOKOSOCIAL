import {
  ContentGenerationService,
  MockContentGenerationProvider,
  type GenerationRequest
} from "@yokosocial/ai";
import { demoEstablishments, demoMedia, demoProducts, platformSchema } from "@yokosocial/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isServerDemoMode } from "@/lib/demo-mode";
import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireTrustedMutationOrigin } from "@/lib/authorization";

const inputSchema = z.object({
  establishmentIds: z.array(z.string()).min(1),
  platforms: z.array(platformSchema).min(1)
});

export async function POST(request: Request) {
  if (!isServerDemoMode()) {
    return NextResponse.json({ error: "Mode démonstration désactivé." }, { status: 404 });
  }
  try {
    requireTrustedMutationOrigin(request);
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const parsed = inputSchema.safeParse(await readJsonWithLimit(request, 16 * 1024));
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres de génération invalides." }, { status: 400 });
  }

  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() + 1);
  startDate.setUTCHours(0, 0, 0, 0);

  const generationRequest: GenerationRequest = {
    organizationId: "demo-org-yokosushi",
    brand: {
      id: "demo-brand-yokosushi",
      name: "YokoSushi — DÉMONSTRATION",
      tone: ["moderne", "gourmand", "direct"],
      guidelines: "Textes courts. Fraîcheur, générosité et livraison uniquement si validées.",
      forbiddenPhrases: ["explosion de saveurs", "expérience inoubliable"],
      languages: ["fr"]
    },
    establishments: demoEstablishments.map((item) => ({
      ...item,
      services: [...item.services],
      validatedFields: []
    })),
    products: demoProducts.map((item) => ({
      ...item,
      establishmentIds: [...item.establishmentIds],
      validated: false,
      demo: true
    })),
    media: demoMedia.map((item) => ({
      ...item,
      establishmentIds: [...item.establishmentIds]
    })),
    platforms: parsed.data.platforms,
    establishmentIds: parsed.data.establishmentIds,
    count: 5,
    startDate: startDate.toISOString(),
    demoMode: true
  };

  const service = new ContentGenerationService(new MockContentGenerationProvider());
  const result = await service.generate(generationRequest);
  return NextResponse.json({
    ...result,
    posts: result.posts.map((post, index) => ({
      ...post,
      id: `demo-post-${index + 1}`,
      status: "DRAFT"
    }))
  });
}
