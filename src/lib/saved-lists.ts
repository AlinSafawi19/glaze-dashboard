import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * A signed-in shopper's cart and wishlist, kept server-side so they survive a
 * cleared browser and follow the customer between devices.
 *
 * The storefront works in product slugs; these tables key on product ids, so a
 * deleted product falls out of every basket rather than lingering as a dead
 * slug. Translation happens here, at the boundary.
 */

export const cartSchema = z.object({
  items: z
    .array(
      z.object({
        Slug: z.string().trim().min(1),
        Qty: z.coerce.number().int().min(1).max(999),
      })
    )
    .max(200),
});

export const wishlistSchema = z.object({
  slugs: z.array(z.string().trim().min(1)).max(500),
});

/** Slug → id for live products only, so archived stock cannot be re-added. */
async function idsForSlugs(slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = await prisma.product.findMany({
    where: { slug: { in: slugs }, archivedAt: null },
    select: { id: true, slug: true },
  });
  return new Map(rows.map((row) => [row.slug, row.id]));
}

export async function readCart(customerId: string): Promise<Array<{ Slug: string; Qty: number }>> {
  const rows = await prisma.cartItem.findMany({
    where: { customerId, product: { archivedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { quantity: true, product: { select: { slug: true } } },
  });
  return rows.map((row) => ({ Slug: row.product.slug, Qty: row.quantity }));
}

/**
 * Replaces the stored cart wholesale. The client always holds the complete
 * list, so a full replace is both simpler and immune to the drift a
 * patch-per-change API accumulates when a request is dropped.
 */
export async function writeCart(
  customerId: string,
  items: Array<{ Slug: string; Qty: number }>
): Promise<Array<{ Slug: string; Qty: number }>> {
  const ids = await idsForSlugs(items.map((i) => i.Slug));

  // Collapse duplicate lines for the same product before writing.
  const quantities = new Map<string, number>();
  for (const item of items) {
    const id = ids.get(item.Slug);
    if (id) quantities.set(id, (quantities.get(id) ?? 0) + item.Qty);
  }

  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { customerId } }),
    prisma.cartItem.createMany({
      data: [...quantities].map(([productId, quantity]) => ({
        customerId,
        productId,
        quantity: Math.min(quantity, 999),
      })),
      skipDuplicates: true,
    }),
  ]);

  return readCart(customerId);
}

export async function readWishlist(customerId: string): Promise<string[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId, product: { archivedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { product: { select: { slug: true } } },
  });
  return rows.map((row) => row.product.slug);
}

export async function writeWishlist(customerId: string, slugs: string[]): Promise<string[]> {
  const ids = await idsForSlugs(slugs);
  const productIds = [...new Set(slugs.map((slug) => ids.get(slug)).filter(Boolean))] as string[];

  await prisma.$transaction([
    prisma.wishlistItem.deleteMany({ where: { customerId } }),
    prisma.wishlistItem.createMany({
      data: productIds.map((productId) => ({ customerId, productId })),
      skipDuplicates: true,
    }),
  ]);

  return readWishlist(customerId);
}

/**
 * Emptying the basket after checkout. Called as part of placing an order so a
 * signed-in shopper does not come back to a cart they have already paid for.
 */
export async function clearCart(customerId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { customerId } });
}
