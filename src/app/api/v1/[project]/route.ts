import type { NextRequest } from "next/server";

import { bearerFrom, verifyApiKey } from "@/lib/api-key";
import { corsHeaders, json } from "@/lib/cors";
import { COLLECTIONS } from "@/lib/public-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PROJECT = "glaze";

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** Schema discovery: what collections exist and what fields each one carries. */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ project: string }> }
) {
  const { project } = await ctx.params;

  const raw = bearerFrom(request);
  if (!raw) return json(request, { error: "API key required" }, { status: 401 });
  if (!(await verifyApiKey(raw))) {
    return json(request, { error: "Invalid API key" }, { status: 401 });
  }
  if (project !== PROJECT) {
    return json(request, { error: "Project not found" }, { status: 404 });
  }

  const [products, brands, categories, collections, skinTypes, utilityPages, orders] =
    await Promise.all([
      prisma.product.count({ where: { archivedAt: null } }),
      prisma.brand.count({ where: { archivedAt: null } }),
      prisma.category.count({ where: { archivedAt: null } }),
      prisma.collection.count({ where: { archivedAt: null } }),
      prisma.skinType.count({ where: { archivedAt: null } }),
      prisma.utilityPage.count({ where: { archivedAt: null } }),
      prisma.order.count({ where: { archivedAt: null } }),
    ]);

  const counts: Record<string, number> = {
    products,
    brands,
    categories,
    collections,
    "skin-types": skinTypes,
    "utility-pages": utilityPages,
    orders,
  };

  return json(request, {
    project: { name: "Glaze", slug: PROJECT },
    collections: Object.values(COLLECTIONS).map((spec) => ({
      name: spec.name,
      slug: spec.slug,
      fields: spec.fields,
      entryCount: counts[spec.slug] ?? 0,
      writable: spec.slug === "orders",
      readable: spec.slug !== "orders",
    })),
  });
}
