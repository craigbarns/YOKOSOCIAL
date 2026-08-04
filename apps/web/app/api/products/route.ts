import { db, type MediaStatus, type Prisma } from "@yokosocial/database";
import { NextResponse } from "next/server";

import { accessErrorResponse, readJsonWithLimit } from "@/lib/api-access";
import {
  AuthorizationError,
  requireOrganization,
  requireTrustedMutationOrigin
} from "@/lib/authorization";
import { productListQuerySchema, productPatchSchema } from "@/lib/catalog-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const recommendedMediaStatuses: MediaStatus[] = ["APPROVED", "NEEDS_REVIEW"];

const productSelection = {
  id: true,
  brandId: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  currency: true,
  allergens: true,
  sourceUrl: true,
  confidence: true,
  validationStatus: true,
  status: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      sourceUrl: true,
      validationStatus: true
    }
  },
  sourcePage: { select: { id: true, sourceUrl: true } },
  mediaAssets: {
    where: { status: { in: recommendedMediaStatuses } },
    orderBy: { qualityScore: "desc" },
    take: 1,
    select: {
      id: true,
      publicUrl: true,
      sourceUrl: true,
      width: true,
      height: true,
      qualityScore: true,
      status: true
    }
  },
  establishmentLinks: {
    orderBy: { createdAt: "asc" },
    select: {
      available: true,
      localPrice: true,
      orderUrl: true,
      sourceUrl: true,
      validationStatus: true,
      establishment: { select: { id: true, name: true, city: true } }
    }
  }
} as const;

type SelectedProduct = Prisma.MenuItemGetPayload<{ select: typeof productSelection }>;

function productDTO(product: SelectedProduct) {
  return {
    id: product.id,
    brandId: product.brandId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price?.toString() ?? null,
    currency: product.currency,
    allergens: product.allergens,
    confidence: product.confidence,
    validationStatus: product.validationStatus,
    status: product.status,
    isDemo: product.isDemo,
    category: product.category,
    sources: {
      productUrl: product.sourceUrl,
      pageUrl: product.sourcePage?.sourceUrl ?? null
    },
    recommendedMedia: product.mediaAssets[0] ?? null,
    establishments: product.establishmentLinks.map((link) => ({
      ...link.establishment,
      available: link.available,
      localPrice: link.localPrice?.toString() ?? null,
      orderUrl: link.orderUrl,
      sourceUrl: link.sourceUrl,
      validationStatus: link.validationStatus
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

async function readPatchInput(request: Request) {
  return productPatchSchema.safeParse(await readJsonWithLimit(request, MAX_BODY_BYTES));
}

async function requireTenantBrand(organizationId: string, brandId: string): Promise<void> {
  const brand = await db.restaurantBrand.findFirst({
    where: { id: brandId, organizationId },
    select: { id: true }
  });
  if (!brand) throw new AuthorizationError();
}

export async function GET(request: Request) {
  const parsed = productListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtres de produits invalides." }, { status: 400 });
  }

  try {
    const context = await requireOrganization(
      parsed.data.organizationId,
      undefined,
      request.headers
    );
    await requireTenantBrand(context.organizationId, parsed.data.brandId);

    const where: Prisma.MenuItemWhereInput = {
      organizationId: context.organizationId,
      brandId: parsed.data.brandId,
      ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.search
        ? {
            OR: [
              { name: { contains: parsed.data.search, mode: "insensitive" } },
              { description: { contains: parsed.data.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const skip = (parsed.data.page - 1) * parsed.data.limit;
    const [total, products, categories] = await db.$transaction([
      db.menuItem.count({ where }),
      db.menuItem.findMany({
        where,
        skip,
        take: parsed.data.limit,
        orderBy: [{ name: "asc" }, { createdAt: "desc" }],
        select: productSelection
      }),
      db.productCategory.findMany({
        where: {
          organizationId: context.organizationId,
          brandId: parsed.data.brandId,
          validationStatus: { not: "REJECTED" }
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true }
      })
    ]);

    return NextResponse.json(
      {
        products: products.map(productDTO),
        categories,
        pagination: {
          page: parsed.data.page,
          limit: parsed.data.limit,
          total,
          pages: Math.ceil(total / parsed.data.limit)
        }
      },
      { headers: { "Cache-Control": "private, no-store" } }
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
      return NextResponse.json({ error: "Correction de produit invalide." }, { status: 400 });
    }

    const context = await requireOrganization(
      parsed.data.organizationId,
      ["OWNER", "ADMIN", "EDITOR"],
      request.headers
    );
    await requireTenantBrand(context.organizationId, parsed.data.brandId);

    const existing = await db.menuItem.findFirst({
      where: {
        id: parsed.data.menuItemId,
        organizationId: context.organizationId,
        brandId: parsed.data.brandId
      },
      select: { id: true }
    });
    if (!existing) throw new AuthorizationError();

    if (parsed.data.categoryId) {
      const category = await db.productCategory.findFirst({
        where: {
          id: parsed.data.categoryId,
          organizationId: context.organizationId,
          brandId: parsed.data.brandId
        },
        select: { id: true }
      });
      if (!category) throw new AuthorizationError();
    }

    if (parsed.data.establishmentIds) {
      const establishmentCount = await db.establishment.count({
        where: {
          id: { in: parsed.data.establishmentIds },
          organizationId: context.organizationId,
          brandId: parsed.data.brandId
        }
      });
      if (establishmentCount !== parsed.data.establishmentIds.length) {
        throw new AuthorizationError();
      }
    }

    const updateData: Prisma.MenuItemUpdateInput = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.categoryId !== undefined) {
      updateData.category = parsed.data.categoryId
        ? { connect: { id: parsed.data.categoryId } }
        : { disconnect: true };
    }
    if (parsed.data.price !== undefined) {
      updateData.price = parsed.data.price;
      updateData.validationStatus = "APPROVED";
    }

    const product = await db.$transaction(async (transaction) => {
      const hasProductFieldChange =
        parsed.data.name !== undefined ||
        parsed.data.description !== undefined ||
        parsed.data.categoryId !== undefined ||
        parsed.data.price !== undefined;
      if (hasProductFieldChange) {
        await transaction.menuItem.update({
          where: { id: existing.id },
          data: updateData
        });
      }

      if (parsed.data.establishmentIds !== undefined) {
        const establishmentIds = parsed.data.establishmentIds;
        await transaction.menuItemEstablishment.deleteMany({
          where: {
            organizationId: context.organizationId,
            menuItemId: existing.id,
            ...(establishmentIds.length > 0 ? { establishmentId: { notIn: establishmentIds } } : {})
          }
        });
        if (establishmentIds.length > 0) {
          await transaction.menuItemEstablishment.createMany({
            data: establishmentIds.map((establishmentId) => ({
              organizationId: context.organizationId,
              menuItemId: existing.id,
              establishmentId,
              validationStatus: "APPROVED"
            })),
            skipDuplicates: true
          });
        }
      }

      await transaction.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "UPDATE",
          entityType: "MenuItem",
          entityId: existing.id,
          metadata: {
            changedFields: [
              ...(parsed.data.name !== undefined ? ["name"] : []),
              ...(parsed.data.description !== undefined ? ["description"] : []),
              ...(parsed.data.categoryId !== undefined ? ["category"] : []),
              ...(parsed.data.price !== undefined ? ["price"] : []),
              ...(parsed.data.establishmentIds !== undefined ? ["establishments"] : [])
            ],
            priceExplicitlyConfirmed: parsed.data.price !== undefined,
            ...(parsed.data.establishmentIds !== undefined
              ? { establishmentCount: parsed.data.establishmentIds.length }
              : {})
          }
        }
      });

      return transaction.menuItem.findFirstOrThrow({
        where: {
          id: existing.id,
          organizationId: context.organizationId,
          brandId: parsed.data.brandId
        },
        select: productSelection
      });
    });

    return NextResponse.json(
      { product: productDTO(product) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = accessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
