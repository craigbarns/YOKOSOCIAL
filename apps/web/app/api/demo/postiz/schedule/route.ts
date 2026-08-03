import { MockPostizProvider, PostizProviderError } from "@yokosocial/postiz";
import { generatedPostSchema } from "@yokosocial/shared";
import { NextResponse } from "next/server";
import { z } from "zod";

import { isServerDemoMode } from "@/lib/demo-mode";
import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireTrustedMutationOrigin } from "@/lib/authorization";

const inputSchema = z.object({
  post: generatedPostSchema.extend({ id: z.string(), status: z.literal("APPROVED") }),
  scenario: z.enum(["success", "error"]),
  scheduledAt: z.iso.datetime({ offset: true })
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
  const parsed = inputSchema.safeParse(await readJsonWithLimit(request, 128 * 1024));
  if (!parsed.success) {
    return NextResponse.json(
      { status: "FAILED", message: "Publication non approuvée ou payload invalide." },
      { status: 400 }
    );
  }
  if (parsed.data.post.format === "reel") {
    return NextResponse.json(
      {
        status: "FAILED",
        message:
          "Le MVP prépare un script de Reel mais ne dispose pas encore d’une vidéo MP4 à envoyer."
      },
      { status: 422 }
    );
  }

  const provider = new MockPostizProvider({
    defaultScheduleScenario: parsed.data.scenario === "error" ? "submission_error" : "success"
  });
  const remoteIds: string[] = [];
  try {
    const uploaded = await Promise.all(
      parsed.data.post.mediaAssetIds.map(async (mediaId, index) =>
        provider.uploadMedia({
          file: new Blob([`demo:${mediaId}`], { type: "image/png" }),
          fileName: `yokosushi-demo-${index + 1}.png`,
          contentType: "image/png"
        })
      )
    );

    for (const platform of parsed.data.post.platforms) {
      if (platform === "facebook" && parsed.data.post.format === "story") continue;
      const integrationId =
        platform === "instagram" ? "mock-instagram-yokosushi" : "mock-facebook-yokosushi";
      const content =
        platform === "instagram"
          ? `${parsed.data.post.instagramCaption ?? ""}\n\n${parsed.data.post.hashtags.join(" ")}`
          : (parsed.data.post.facebookCaption ?? "");
      const result = await provider.schedulePost({
        integrationId,
        identifier: platform,
        content,
        format: parsed.data.post.format,
        media: uploaded,
        scheduledAt: parsed.data.scheduledAt,
        shortLink: false
      });
      if (result.outcome === "UNKNOWN_REMOTE_STATE") {
        return NextResponse.json({
          status: "FAILED",
          message: "État distant incertain : aucun nouvel envoi automatique ne sera tenté."
        });
      }
      remoteIds.push(...result.remotePosts.map((post) => post.remotePostId));
    }

    return NextResponse.json({
      status: "SCHEDULED",
      remotePostId: remoteIds.join(","),
      message: `${remoteIds.length} publication(s) programmée(s) avec MockPostizProvider.`
    });
  } catch (error) {
    const message =
      error instanceof PostizProviderError
        ? error.message
        : "Erreur de programmation simulée et enregistrée.";
    return NextResponse.json({ status: "FAILED", message }, { status: 422 });
  }
}
