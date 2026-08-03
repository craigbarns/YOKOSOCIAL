import { db } from "@yokosocial/database";
import { NextResponse } from "next/server";
import { z } from "zod";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import { requireSession, requireTrustedMutationOrigin } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

const inputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  websiteUrl: z.url().refine((value) => {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLocaleLowerCase("en");
    return (
      parsed.protocol === "https:" &&
      (hostname === "yokosushi.fr" || hostname === "www.yokosushi.fr")
    );
  })
});

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "organization"
  );
}

async function readInput(request: Request) {
  try {
    return inputSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const session = await requireSession(request.headers);
    const memberships = await db.organizationMember.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            brands: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true, slug: true, websiteUrl: true }
            }
          }
        }
      }
    });

    return NextResponse.json(
      {
        organizations: memberships.map(({ organization, role }) => ({
          ...organization,
          role
        }))
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
    const session = await requireSession(request.headers);
    const parsed = await readInput(request);

    if (!parsed?.success) {
      return NextResponse.json(
        { error: "Informations d’organisation invalides." },
        { status: 400 }
      );
    }

    const baseSlug = slugify(parsed.data.name);
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
    const organization = await db.$transaction(async (transaction) => {
      const created = await transaction.organization.create({
        data: {
          name: parsed.data.name,
          slug,
          members: { create: { userId: session.user.id, role: "OWNER" } },
          brands: {
            create: {
              name: parsed.data.name,
              slug: baseSlug,
              websiteUrl: parsed.data.websiteUrl
            }
          }
        },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          brands: {
            select: { id: true, name: true, slug: true, websiteUrl: true }
          }
        }
      });

      const brand = created.brands[0];
      if (!brand) throw new Error("Organization brand invariant failed.");

      await transaction.brandProfile.create({
        data: {
          organizationId: created.id,
          brandId: brand.id,
          tones: ["GOURMAND", "MODERN", "WARM"],
          languages: ["fr"],
          customInstruction:
            "Mettre en valeur la fraîcheur et la générosité sans inventer de fait local."
        }
      });
      await transaction.auditLog.create({
        data: {
          organizationId: created.id,
          actorUserId: session.user.id,
          action: "CREATE",
          entityType: "Organization",
          entityId: created.id,
          metadata: { source: "onboarding" }
        }
      });

      return { ...created, role: "OWNER" as const };
    });

    return NextResponse.json(
      { organization },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" }
      }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
