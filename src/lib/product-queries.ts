import "server-only";

import { prisma } from "@/lib/prisma";
import { BY_NAME } from "@/lib/resources";
import type { Option, ProductValues } from "@/components/product-form";

/** Everything the product form needs to render its selects and checkboxes. */
export async function loadProductOptions(): Promise<{
  brands: Option[];
  categories: Option[];
  collections: Option[];
  skinTypes: Option[];
  knownSizes: string[];
}> {
  const select = { id: true, title: true };
  const live = { archivedAt: null };
  const orderBy = [{ sortIndex: "asc" as const }, { title: "asc" as const }];

  const [brands, categories, collections, skinTypes, sizes] = await Promise.all([
    // Brands read A–Z, so a newly added one is in place immediately rather than
    // at the bottom of the list.
    prisma.brand.findMany({ where: live, orderBy: BY_NAME, select }),
    prisma.category.findMany({ where: live, orderBy, select }),
    prisma.collection.findMany({ where: live, orderBy, select }),
    prisma.skinType.findMany({ where: live, orderBy, select }),
    prisma.product.findMany({
      where: { size: { not: null } },
      distinct: ["size"],
      orderBy: { size: "asc" },
      select: { size: true },
    }),
  ]);

  return {
    brands,
    categories,
    collections,
    skinTypes,
    knownSizes: sizes.map((s) => s.size!).filter(Boolean),
  };
}

/**
 * Loads one product and flattens it into the form's string-shaped values.
 *
 * Returns null for an archived product as well as a missing one: archived means
 * not editable, so the editor must not open. `updateProduct` enforces the same
 * rule, since a page-level check only stops navigation.
 */
export async function loadProduct(
  id: string
): Promise<(ProductValues & { id: string; slug: string; sku: string }) | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      categories: { select: { categoryId: true } },
      skinTypes: { select: { skinTypeId: true } },
    },
  });
  if (!product || product.archivedAt) return null;

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    coverImage: product.coverImage ?? "",
    image2: product.image2 ?? "",
    image3: product.image3 ?? "",
    image4: product.image4 ?? "",
    price: String(Number(product.price)),
    discount: String(product.discount),
    sku: product.sku ?? "",
    size: product.size ?? "",
    keyIngredients: product.keyIngredients ?? "",
    description: product.description ?? "",
    isNewIn: product.isNewIn,
    isLimited: product.isLimited,
    brandId: product.brandId ?? "",
    categoryIds: product.categories.map((c) => c.categoryId),
    collectionId: product.collectionId ?? "",
    skinTypeIds: product.skinTypes.map((s) => s.skinTypeId),
  };
}
