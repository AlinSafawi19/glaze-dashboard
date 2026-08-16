import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * "Best seller" is earned, not ticked.
 *
 * The client sets "New in" and "Limited" by hand; this one is worked out from
 * what has actually sold, so the badge cannot drift away from reality.
 */

/** How many products may hold the badge at once. */
export const BEST_SELLER_SLOTS = 3;

/** Units must have sold at least this many times to qualify at all. */
const MINIMUM_UNITS = 1;

/**
 * Product ids ranked by units sold, best first, capped at the slot count.
 * Cancelled and archived orders do not count.
 */
export async function bestSellerIds(): Promise<Set<string>> {
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { archivedAt: null, status: { not: "CANCELLED" } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: BEST_SELLER_SLOTS,
  });

  return new Set(
    rows
      .filter((row) => (row._sum.quantity ?? 0) >= MINIMUM_UNITS)
      .map((row) => row.productId!)
  );
}

/** Units sold per product id — used by the dashboard's product list. */
export async function unitsSoldByProduct(): Promise<Map<string, number>> {
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { archivedAt: null, status: { not: "CANCELLED" } },
    },
    _sum: { quantity: true },
  });

  return new Map(rows.map((row) => [row.productId!, row._sum.quantity ?? 0]));
}
