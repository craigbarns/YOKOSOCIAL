import { createHash } from "node:crypto";

import { db } from "@yokosocial/database";
import { assertSchedulable } from "@yokosocial/shared";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import { enqueueTenantJob } from "@/lib/job-queue";
import { schedulePostSchema } from "@/lib/post-contract";
import { assertServerPostizTenantScope } from "@/lib/postiz-provider";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;

function publicationIdempotencyKey(
  postId: string,
  versionNumber: number,
  socialAccountId: string,
  scheduledAt: string
): string {
  return createHash("sha256")
    .update([postId, versionNumber, socialAccountId, scheduledAt].join("\0"))
    .digest("hex");
}

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = schedulePostSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Paramètres de programmation invalides.",
          issues: parsed.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }
    const scheduledAt = new Date(parsed.data.scheduledAt);
    const authorization = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    assertServerPostizTenantScope(authorization.organizationId);
    const { postId } = await context.params;

    const prepared = await db.$transaction(async (transaction) => {
      const post = await transaction.socialPost.findFirst({
        where: { id: postId, organizationId: authorization.organizationId },
        include: {
          versions: {
            where: { organizationId: authorization.organizationId },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true, createdAt: true }
          },
          establishmentLinks: { select: { establishmentId: true } },
          media: {
            include: {
              mediaAsset: {
                select: { id: true, status: true, publicUrl: true, mimeType: true }
              }
            },
            orderBy: { sortOrder: "asc" }
          },
          publicationJobs: {
            select: { id: true, socialAccountId: true, idempotencyKey: true, status: true }
          }
        }
      });
      if (!post) return { kind: "missing" as const };

      if (post.status === "SCHEDULED") {
        const sameDate = post.scheduledAt?.toISOString() === scheduledAt.toISOString();
        const existingAccountIds = new Set(post.publicationJobs.map((job) => job.socialAccountId));
        const sameAccounts =
          parsed.data.socialAccountIds.length === existingAccountIds.size &&
          parsed.data.socialAccountIds.every((id) => existingAccountIds.has(id));
        if (!sameDate || !sameAccounts || post.publicationJobs.length === 0) {
          return { kind: "already-scheduled" as const };
        }
        return {
          kind: "prepared" as const,
          postId: post.id,
          jobs: post.publicationJobs.filter((job) => job.status === "PENDING"),
          jobsCount: post.publicationJobs.length,
          recovered: true
        };
      }

      if (scheduledAt.getTime() <= Date.now()) {
        return { kind: "past-schedule" as const };
      }

      const currentVersion = post.versions[0];
      assertSchedulable(post.status, currentVersion?.id);
      if (
        !currentVersion ||
        currentVersion.versionNumber !== post.currentVersionNumber ||
        !post.approvedAt ||
        post.approvedAt.getTime() < currentVersion.createdAt.getTime()
      ) {
        return { kind: "approval-stale" as const };
      }
      if (post.format !== "IMAGE" && post.format !== "CAROUSEL") {
        return { kind: "unsupported-format" as const, format: post.format };
      }
      const mediaValid =
        (post.format === "IMAGE"
          ? post.media.length === 1
          : post.media.length >= 2 && post.media.length <= 10) &&
        post.media.every(
          (item) =>
            item.mediaAsset.status === "APPROVED" &&
            Boolean(item.mediaAsset.publicUrl) &&
            item.mediaAsset.mimeType.startsWith("image/")
        );
      if (!mediaValid) return { kind: "invalid-media" as const };

      const accounts = await transaction.socialAccount.findMany({
        where: {
          organizationId: authorization.organizationId,
          brandId: post.brandId,
          id: { in: parsed.data.socialAccountIds },
          status: "CONNECTED",
          remoteIntegrationId: { not: null }
        },
        select: {
          id: true,
          platform: true,
          establishmentId: true,
          remoteIntegrationId: true
        }
      });
      const accountPlatforms = new Set(accounts.map((account) => account.platform));
      const expectedPlatforms = new Set(post.platforms);
      const onePerPlatform =
        accounts.length === parsed.data.socialAccountIds.length &&
        accounts.length === expectedPlatforms.size &&
        accountPlatforms.size === accounts.length &&
        [...expectedPlatforms].every((item) => accountPlatforms.has(item));
      const selectedEstablishments = new Set(
        post.establishmentLinks.map((link) => link.establishmentId)
      );
      const accountScopeValid = accounts.every(
        (account) =>
          !account.establishmentId ||
          selectedEstablishments.size === 0 ||
          selectedEstablishments.has(account.establishmentId)
      );
      if (!onePerPlatform || !accountScopeValid) {
        return { kind: "invalid-accounts" as const };
      }

      const claimed = await transaction.socialPost.updateMany({
        where: {
          id: post.id,
          organizationId: authorization.organizationId,
          status: "APPROVED",
          currentVersionNumber: currentVersion.versionNumber
        },
        data: { status: "SCHEDULED", scheduledAt }
      });
      if (claimed.count !== 1) return { kind: "concurrent-schedule" as const };

      const createdJobs = [];
      for (const account of accounts) {
        const idempotencyKey = publicationIdempotencyKey(
          post.id,
          currentVersion.versionNumber,
          account.id,
          scheduledAt.toISOString()
        );
        const publicationJob = await transaction.publicationJob.create({
          data: {
            organizationId: authorization.organizationId,
            socialPostId: post.id,
            socialAccountId: account.id,
            provider: process.env.POSTIZ_MODE === "real" ? "postiz" : "postiz-mock",
            platform: account.platform,
            status: "PENDING",
            scheduledAt,
            idempotencyKey,
            sanitizedPayload: {
              socialPostId: post.id,
              socialAccountId: account.id,
              platform: account.platform,
              format: post.format,
              versionNumber: currentVersion.versionNumber,
              scheduledAt: scheduledAt.toISOString(),
              mediaAssetIds: post.media.map((item) => item.mediaAsset.id)
            }
          },
          select: { id: true, socialAccountId: true, idempotencyKey: true }
        });
        createdJobs.push(publicationJob);
      }
      await transaction.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          actorUserId: authorization.userId,
          action: "SCHEDULE",
          entityType: "SocialPost",
          entityId: post.id,
          metadata: {
            versionNumber: currentVersion.versionNumber,
            approvedVersionId: currentVersion.id,
            scheduledAt: scheduledAt.toISOString(),
            socialAccountIds: accounts.map((account) => account.id)
          }
        }
      });
      return {
        kind: "prepared" as const,
        postId: post.id,
        jobs: createdJobs,
        jobsCount: createdJobs.length,
        recovered: false
      };
    });

    if (prepared.kind === "missing") {
      return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });
    }
    if (prepared.kind === "already-scheduled") {
      return NextResponse.json(
        { error: "Cette publication est déjà programmée avec une autre configuration." },
        { status: 409 }
      );
    }
    if (prepared.kind === "past-schedule") {
      return NextResponse.json(
        { error: "La date de programmation doit être dans le futur." },
        { status: 400 }
      );
    }
    if (prepared.kind === "concurrent-schedule") {
      return NextResponse.json(
        { error: "La programmation a changé. Rechargez la publication avant de continuer." },
        { status: 409 }
      );
    }
    if (prepared.kind === "approval-stale") {
      return NextResponse.json(
        { error: "La version approuvée n’est plus la version courante." },
        { status: 409 }
      );
    }
    if (prepared.kind === "unsupported-format") {
      return NextResponse.json(
        {
          error:
            "Le MVP programme les images et carrousels. Stories et Reels restent des scripts à préparer."
        },
        { status: 409 }
      );
    }
    if (prepared.kind === "invalid-media") {
      return NextResponse.json(
        { error: "Les médias doivent être des copies locales validées avant programmation." },
        { status: 409 }
      );
    }
    if (prepared.kind === "invalid-accounts") {
      return NextResponse.json(
        {
          error: "Sélectionnez exactement un compte connecté pour chaque réseau de la publication."
        },
        { status: 409 }
      );
    }

    const queueResults = await Promise.allSettled(
      prepared.jobs.map((job) =>
        enqueueTenantJob("publication.schedule", {
          organizationId: authorization.organizationId,
          actorId: authorization.userId,
          resourceId: job.id,
          idempotencyKey: `publication-schedule-${job.id}`
        })
      )
    );
    const queued = queueResults.filter((result) => result.status === "fulfilled").length;
    const response = {
      postId: prepared.postId,
      status: "SCHEDULED",
      jobsCreated: prepared.jobsCount,
      jobsQueued: queued,
      recovered: prepared.recovered,
      warning:
        queued === prepared.jobs.length
          ? null
          : "La programmation est enregistrée mais certaines tâches doivent être remises en file."
    };
    return NextResponse.json(response, { status: prepared.jobs.length > 0 ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("explicitement approuvée")) {
      return NextResponse.json(
        { error: "La version courante doit être approuvée avant programmation." },
        { status: 409 }
      );
    }
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
