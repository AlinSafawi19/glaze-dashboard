import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * SKUs are issued by the dashboard, not typed in.
 *
 * The catalogue arrived from Canopy with five-digit numbers, and the storefront
 * and the client's own paperwork quote them, so new ones continue the same
 * series rather than switching to a random or prefixed code. Like a slug, a SKU
 * is set once at creation and never rewritten afterwards: it is what an invoice
 * or a stock sheet already refers to.
 */
const FIRST_SKU = 10000;

/**
 * One pass over the existing codes, then consecutive numbers on demand — an
 * import of hundreds of rows should not re-read the table for every product.
 */
export async function skuIssuer(): Promise<() => string> {
  const products = await prisma.product.findMany({
    where: { sku: { not: null } },
    select: { sku: true },
  });

  const taken = new Set(products.map((product) => product.sku ?? ""));
  const numbers = products
    .map((product) => Number.parseInt(product.sku ?? "", 10))
    .filter((value) => Number.isFinite(value));

  let next = Math.max(FIRST_SKU - 1, ...numbers);

  return () => {
    do {
      next += 1;
    } while (taken.has(String(next)));
    taken.add(String(next));
    return String(next);
  };
}

export async function nextSku(): Promise<string> {
  return (await skuIssuer())();
}
