import "server-only";

import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/resources";

/**
 * Slugs are derived from the title and never edited by hand.
 *
 * They are also generated once, at create time, and left alone afterwards.
 * Renaming a product must not move its URL: the storefront keeps carts and
 * wishlists in the browser as lists of slugs, so a slug that follows the title
 * would empty a shopper's basket the moment the client fixes a typo.
 */
async function unique(
  base: string,
  taken: (candidate: string) => Promise<boolean>
): Promise<string> {
  const root = base || "item";
  if (!(await taken(root))) return root;

  for (let n = 2; n < 500; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }

  // Practically unreachable; keeps the return type honest.
  return `${root}-${Date.now()}`;
}

type SlugModel =
  | "brand"
  | "category"
  | "collection"
  | "skinType"
  | "tickerItem"
  | "utilityPage"
  | "product";

export async function uniqueSlug(model: SlugModel, title: string): Promise<string> {
  const base = slugify(title);

  const exists = async (slug: string): Promise<boolean> => {
    const where = { slug };
    switch (model) {
      case "brand":
        return (await prisma.brand.count({ where })) > 0;
      case "category":
        return (await prisma.category.count({ where })) > 0;
      case "collection":
        return (await prisma.collection.count({ where })) > 0;
      case "skinType":
        return (await prisma.skinType.count({ where })) > 0;
      case "tickerItem":
        return (await prisma.tickerItem.count({ where })) > 0;
      case "utilityPage":
        return (await prisma.utilityPage.count({ where })) > 0;
      case "product":
        return (await prisma.product.count({ where })) > 0;
    }
  };

  return unique(base, exists);
}
