import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { REFERENCE_ATTEMPTS, newOrderReference } from "@/lib/order-reference";

/**
 * Checkout payload. The storefront posts structured `Items`; the older
 * `"2 x Marble Mortar (marble-mortar)"` string form is still accepted so a
 * storefront that has not been redeployed yet keeps working.
 */
export const checkoutSchema = z.object({
  Name: z.string().trim().min(1, "Name is required.").max(160),
  Phone: z.string().trim().min(1, "Phone is required.").max(60),
  /// Optional: a guest may not leave one. When it is there, the shopper gets a
  /// confirmation; a signed-in shopper falls back to their account address.
  Email: z.string().trim().toLowerCase().email("That email does not look right.").max(255).optional(),
  Address: z.string().trim().min(1, "Address is required.").max(500),
  City: z.string().trim().min(1, "City is required.").max(120),
  Notes: z.string().trim().max(2000).optional().default(""),
  Payment: z.string().trim().max(60).optional().default("Cash on delivery"),
  Total: z.union([z.string(), z.number()]).optional(),
  Items: z.union([
    z.string(),
    z.array(
      z.object({
        Slug: z.string().trim().min(1),
        Qty: z.coerce.number().int().min(1).max(999),
      })
    ),
  ]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** `"2 x Marble Mortar (marble-mortar), 1 x Black Pump (black-pump)"` */
function parseLegacyItems(value: string): Array<{ Slug: string; Qty: number }> {
  const out: Array<{ Slug: string; Qty: number }> = [];
  for (const chunk of value.split(/,(?![^(]*\))/)) {
    const match = chunk.trim().match(/^(\d+)\s*[x×]\s*.*\(([^)]+)\)\s*$/i);
    if (match) out.push({ Slug: match[2].trim(), Qty: Number.parseInt(match[1], 10) });
  }
  return out;
}

export class CheckoutError extends Error {}

/**
 * Turns a checkout payload into an order.
 *
 * Prices are re-read from the catalogue rather than taken from the request —
 * the posted `Total` is only used to warn about drift, never to charge.
 *
 * `customerId` comes from a verified session token, never from the body, so a
 * caller cannot file an order against somebody else's account. It stays
 * optional because guest checkout is still open.
 */
export async function placeOrder(
  input: CheckoutInput,
  customerId: string | null = null,
  /** The signed-in shopper's address, used when the payload leaves none. */
  accountEmail: string | null = null
) {
  const requested =
    typeof input.Items === "string" ? parseLegacyItems(input.Items) : input.Items;

  if (requested.length === 0) {
    throw new CheckoutError("The order has no items.");
  }

  // Collapse duplicate lines for the same product.
  const quantities = new Map<string, number>();
  for (const item of requested) {
    quantities.set(item.Slug, (quantities.get(item.Slug) ?? 0) + item.Qty);
  }

  const products = await prisma.product.findMany({
    where: { slug: { in: [...quantities.keys()] }, archivedAt: null },
    select: { id: true, slug: true, title: true, price: true, discount: true },
  });

  if (products.length === 0) {
    throw new CheckoutError("None of the items in this order are still available.");
  }

  const lines = products.map((product) => {
    const quantity = quantities.get(product.slug) ?? 0;
    const price = Number(product.price);
    // Discount is a whole percentage off, matching the product page.
    const unitPrice =
      product.discount > 0 ? Math.round(price * (1 - product.discount / 100)) : price;
    return {
      productId: product.id,
      slug: product.slug,
      title: product.title,
      unitPrice: unitPrice.toFixed(2),
      quantity,
    };
  });

  const total = lines.reduce((sum, l) => sum + Number(l.unitPrice) * l.quantity, 0);

  const claimed = input.Total === undefined ? null : Number(input.Total);
  if (claimed !== null && Number.isFinite(claimed) && Math.abs(claimed - total) > 0.01) {
    console.warn(
      `[orders] client total ${claimed} != server total ${total}; charging server total`
    );
  }

  // References are random, so two orders placed in the same instant can collide.
  // The unique index is the authority; this just tries again when it fires.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await createOrder(input, customerId, accountEmail, lines, total);
    } catch (error) {
      if (attempt >= REFERENCE_ATTEMPTS || !isDuplicateReference(error)) throw error;
    }
  }
}

/** A unique-constraint failure on `reference`, and nothing else. */
function isDuplicateReference(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002" &&
    String((error as { meta?: { target?: unknown } }).meta?.target ?? "").includes("reference")
  );
}

function createOrder(
  input: CheckoutInput,
  customerId: string | null,
  accountEmail: string | null,
  lines: Array<{
    productId: string;
    slug: string;
    title: string;
    unitPrice: string;
    quantity: number;
  }>,
  total: number
) {
  return prisma.order.create({
    data: {
      reference: newOrderReference(),
      name: input.Name,
      phone: input.Phone,
      address: input.Address,
      city: input.City,
      notes: input.Notes || null,
      payment: input.Payment || "Cash on delivery",
      email: input.Email || accountEmail,
      total: total.toFixed(2),
      customerId,
      items: { create: lines },
    },
    select: {
      id: true,
      number: true,
      reference: true,
      total: true,
      createdAt: true,
      name: true,
      phone: true,
      address: true,
      city: true,
      notes: true,
      payment: true,
      email: true,
      items: { select: { title: true, quantity: true, unitPrice: true } },
    },
  });
}
