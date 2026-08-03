import { db, Prisma } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import {
  AuthorizationError,
  requireOrganization,
  requireTrustedMutationOrigin
} from "@/lib/authorization";
import {
  establishmentCreateSchema,
  establishmentListQuerySchema,
  establishmentPatchSchema
} from "@/lib/brand-settings-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "establishment"
  );
}

async function readCreateInput(request: Request) {
  return establishmentCreateSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
}

async function readPatchInput(request: Request) {
  return establishmentPatchSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
}

const establishmentSelection = {
  id: true,
  organizationId: true,
  brandId: true,
  name: true,
  slug: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  city: true,
  countryCode: true,
  phone: true,
  businessHours: true,
  services: true,
  orderUrl: true,
  reservationUrl: true,
  instagramUrl: true,
  facebookUrl: true,
  sourceUrl: true,
  status: true,
  validationStatus: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true
} as const;

async function requireTenantBrand(organizationId: string, brandId: string): Promise<void> {
  const brand = await db.restaurantBrand.findFirst({
    where: { id: brandId, organizationId },
    select: { id: true }
  });
  if (!brand) throw new AuthorizationError();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = establishmentListQuerySchema.safeParse({
    organizationId: url.searchParams.get("organizationId"),
    brandId: url.searchParams.get("brandId") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  try {
    const context = await requireOrganization(
      parsed.data.organizationId,
      undefined,
      request.headers
    );
    if (parsed.data.brandId) {
      await requireTenantBrand(context.organizationId, parsed.data.brandId);
    }
    const establishments = await db.establishment.findMany({
      where: {
        organizationId: context.organizationId,
        ...(parsed.data.brandId ? { brandId: parsed.data.brandId } : {})
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: establishmentSelection
    });

    return NextResponse.json(
      { establishments },
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
    const parsed = await readCreateInput(request);

    if (!parsed.success) {
      return NextResponse.json({ error: "Établissement invalide." }, { status: 400 });
    }

    const context = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN"],
      request.headers
    );
    await requireTenantBrand(context.organizationId, parsed.data.brandId);

    const slug = `${slugify(parsed.data.name)}-${crypto.randomUUID().slice(0, 8)}`;
    const establishment = await db.$transaction(async (transaction) => {
      const created = await transaction.establishment.create({
        data: {
          organizationId: context.organizationId,
          brandId: parsed.data.brandId,
          name: parsed.data.name,
          slug,
          city: parsed.data.city ?? null,
          validationStatus: "UNREVIEWED",
          status: "NEEDS_REVIEW"
        },
        select: establishmentSelection
      });

      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "CREATE",
          entityType: "Establishment",
          entityId: created.id,
          metadata: { source: "manual" }
        }
      });

      return created;
    });

    return NextResponse.json(
      { establishment },
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

export async function PATCH(request: Request) {
  try {
    requireTrustedMutationOrigin(request);
    const parsed = await readPatchInput(request);
    if (!parsed.success) {
      return NextResponse.json({ error: "Correction d’établissement invalide." }, { status: 400 });
    }

    const context = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    await requireTenantBrand(context.organizationId, parsed.data.brandId);

    const existing = await db.establishment.findFirst({
      where: {
        id: parsed.data.establishmentId,
        organizationId: context.organizationId,
        brandId: parsed.data.brandId
      },
      select: { id: true }
    });
    if (!existing) throw new AuthorizationError();

    const updateData: Prisma.EstablishmentUpdateInput = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.addressLine1 !== undefined) updateData.addressLine1 = parsed.data.addressLine1;
    if (parsed.data.addressLine2 !== undefined) updateData.addressLine2 = parsed.data.addressLine2;
    if (parsed.data.postalCode !== undefined) updateData.postalCode = parsed.data.postalCode;
    if (parsed.data.city !== undefined) updateData.city = parsed.data.city;
    if (parsed.data.countryCode !== undefined) updateData.countryCode = parsed.data.countryCode;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.businessHours !== undefined) {
      updateData.businessHours =
        parsed.data.businessHours === null ? Prisma.DbNull : parsed.data.businessHours;
    }
    if (parsed.data.services !== undefined) updateData.services = parsed.data.services;
    if (parsed.data.orderUrl !== undefined) updateData.orderUrl = parsed.data.orderUrl;
    if (parsed.data.reservationUrl !== undefined) {
      updateData.reservationUrl = parsed.data.reservationUrl;
    }
    if (parsed.data.instagramUrl !== undefined) updateData.instagramUrl = parsed.data.instagramUrl;
    if (parsed.data.facebookUrl !== undefined) updateData.facebookUrl = parsed.data.facebookUrl;

    const criticalFields = [
      ...(parsed.data.addressLine1 !== undefined ? ["addressLine1"] : []),
      ...(parsed.data.addressLine2 !== undefined ? ["addressLine2"] : []),
      ...(parsed.data.postalCode !== undefined ? ["postalCode"] : []),
      ...(parsed.data.city !== undefined ? ["city"] : []),
      ...(parsed.data.countryCode !== undefined ? ["countryCode"] : []),
      ...(parsed.data.phone !== undefined ? ["phone"] : []),
      ...(parsed.data.businessHours !== undefined ? ["businessHours"] : [])
    ];
    if (parsed.data.reviewDecision === "APPROVED") {
      updateData.validationStatus = "APPROVED";
      updateData.status = "ACTIVE";
    } else if (parsed.data.reviewDecision === "REJECTED") {
      updateData.validationStatus = "REJECTED";
      updateData.status = "NEEDS_REVIEW";
    }

    const auditAction =
      parsed.data.reviewDecision === "APPROVED"
        ? "APPROVE"
        : parsed.data.reviewDecision === "REJECTED"
          ? "REJECT"
          : "UPDATE";

    const establishment = await db.$transaction(async (transaction) => {
      const updated = await transaction.establishment.update({
        where: { id: existing.id },
        data: updateData,
        select: establishmentSelection
      });

      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: auditAction,
          entityType: "Establishment",
          entityId: existing.id,
          metadata: {
            changedFields: [
              ...(parsed.data.name !== undefined ? ["name"] : []),
              ...criticalFields,
              ...(parsed.data.services !== undefined ? ["services"] : []),
              ...(parsed.data.orderUrl !== undefined ? ["orderUrl"] : []),
              ...(parsed.data.reservationUrl !== undefined ? ["reservationUrl"] : []),
              ...(parsed.data.instagramUrl !== undefined ? ["instagramUrl"] : []),
              ...(parsed.data.facebookUrl !== undefined ? ["facebookUrl"] : []),
              ...(parsed.data.reviewDecision !== undefined ? ["validationStatus", "status"] : [])
            ],
            criticalFieldsExplicitlyConfirmed:
              parsed.data.criticalFieldsConfirmed === true &&
              (criticalFields.length > 0 || parsed.data.reviewDecision === "APPROVED")
          }
        }
      });

      return updated;
    });

    return NextResponse.json(
      { establishment },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
