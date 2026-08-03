import { db } from "@yokosocial/database";
import {
  assertPostTransition,
  InvalidPostTransitionError,
  type SocialPostStatus
} from "@yokosocial/shared";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireOrganization, requireTrustedMutationOrigin } from "@/lib/authorization";
import { postTransitionSchema } from "@/lib/post-contract";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;

const targetStatus = {
  submit: "PENDING_REVIEW",
  approve: "APPROVED",
  reject: "REJECTED",
  reopen: "DRAFT",
  cancel: "CANCELLED"
} as const satisfies Record<string, SocialPostStatus>;

export async function POST(request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = postTransitionSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Décision de validation invalide.", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const reviewerAction = parsed.data.action === "approve" || parsed.data.action === "reject";
    const allowedRoles = reviewerAction
      ? (["OWNER", "ADMIN", "REVIEWER"] as const)
      : (["OWNER", "ADMIN", "EDITOR"] as const);
    const authorization = await requireOrganization(
      parsed.data.organizationId,
      allowedRoles,
      request.headers
    );
    const { postId } = await context.params;
    const result = await db.$transaction(async (transaction) => {
      const post = await transaction.socialPost.findFirst({
        where: { id: postId, organizationId: authorization.organizationId },
        include: {
          versions: {
            where: { organizationId: authorization.organizationId },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: { id: true, versionNumber: true }
          },
          establishmentLinks: {
            include: {
              establishment: {
                select: { status: true, validationStatus: true }
              }
            }
          },
          media: {
            include: {
              mediaAsset: { select: { status: true, publicUrl: true } }
            }
          },
          _count: { select: { publicationJobs: true } }
        }
      });
      if (!post) return { kind: "missing" as const };
      if (
        parsed.data.action === "cancel" &&
        (["SCHEDULED", "PUBLISHING", "PUBLISHED"].includes(post.status) ||
          post._count.publicationJobs > 0)
      ) {
        return { kind: "remote-cancellation-required" as const };
      }

      const target = targetStatus[parsed.data.action];
      assertPostTransition(post.status, target);
      const currentVersion = post.versions[0];
      if (!currentVersion || currentVersion.versionNumber !== post.currentVersionNumber) {
        return { kind: "missing-version" as const };
      }

      if (target === "APPROVED") {
        const establishmentsValid = post.establishmentLinks.every(
          (link) =>
            link.establishment.status === "ACTIVE" &&
            link.establishment.validationStatus === "APPROVED"
        );
        const mediaValid =
          post.media.length > 0 &&
          post.media.every(
            (link) => link.mediaAsset.status === "APPROVED" && Boolean(link.mediaAsset.publicUrl)
          );
        if (!establishmentsValid || !mediaValid) {
          return { kind: "invalid-facts" as const };
        }
      }

      const now = new Date();
      const changed = await transaction.socialPost.updateMany({
        where: {
          id: post.id,
          organizationId: authorization.organizationId,
          status: post.status,
          currentVersionNumber: currentVersion.versionNumber
        },
        data: {
          status: target,
          ...(target === "APPROVED"
            ? {
                approvedById: authorization.userId,
                approvedAt: now,
                rejectedAt: null,
                rejectionReason: null,
                rejectionNote: null
              }
            : {}),
          ...(target === "REJECTED"
            ? {
                rejectedAt: now,
                rejectionReason: parsed.data.reason ?? null,
                rejectionNote: parsed.data.note ?? null,
                approvedById: null,
                approvedAt: null
              }
            : {}),
          ...(target === "DRAFT"
            ? {
                approvedById: null,
                approvedAt: null,
                rejectedAt: null,
                rejectionReason: null,
                rejectionNote: null
              }
            : {})
        }
      });
      if (changed.count !== 1) return { kind: "concurrent-update" as const };

      if (target === "REJECTED") {
        await transaction.userFeedback.create({
          data: {
            organizationId: authorization.organizationId,
            userId: authorization.userId,
            socialPostId: post.id,
            target: "SOCIAL_POST",
            reason: parsed.data.reason ?? null,
            message: parsed.data.note ?? null,
            metadata: { versionNumber: currentVersion.versionNumber }
          }
        });
      }
      await transaction.auditLog.create({
        data: {
          organizationId: authorization.organizationId,
          actorUserId: authorization.userId,
          action:
            target === "APPROVED"
              ? "APPROVE"
              : target === "REJECTED"
                ? "REJECT"
                : target === "CANCELLED"
                  ? "CANCEL"
                  : "UPDATE",
          entityType: "SocialPost",
          entityId: post.id,
          metadata: {
            from: post.status,
            to: target,
            versionNumber: currentVersion.versionNumber,
            approvedVersionId: target === "APPROVED" ? currentVersion.id : null
          }
        }
      });
      return {
        kind: "transitioned" as const,
        post: {
          id: post.id,
          status: target,
          currentVersionNumber: currentVersion.versionNumber,
          approvedVersionId: target === "APPROVED" ? currentVersion.id : null
        }
      };
    });

    if (result.kind === "missing") {
      return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });
    }
    if (result.kind === "remote-cancellation-required") {
      return NextResponse.json(
        { error: "Une publication déjà envoyée doit être annulée via le workflow Postiz." },
        { status: 409 }
      );
    }
    if (result.kind === "missing-version" || result.kind === "concurrent-update") {
      return NextResponse.json(
        { error: "La version a changé. Rechargez la publication avant de continuer." },
        { status: 409 }
      );
    }
    if (result.kind === "invalid-facts") {
      return NextResponse.json(
        {
          error:
            "Les établissements et médias liés doivent être validés avant l’approbation humaine."
        },
        { status: 409 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidPostTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
