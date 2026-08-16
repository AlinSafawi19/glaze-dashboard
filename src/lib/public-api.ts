import "server-only";

import type { Prisma } from "@prisma/client";

import { bestSellerIds } from "@/lib/best-sellers";
import { prisma } from "@/lib/prisma";

/**
 * Wire format for /api/v1.
 *
 * The storefront was written against Canopy's generic CMS endpoint, so the
 * field names here are Canopy's ("Cover img 1", "Sales type", …) rather than
 * this database's column names. Keeping the shape byte-compatible means the
 * cutover is an env-var change, and rolling back is the same change in reverse.
 *
 * Numbers go out as strings for the same reason — that is what Canopy emitted
 * and what the storefront's `parseFloat` calls expect.
 */

export type Wire = Record<string, unknown>;

export interface FieldSpec {
  name: string;
  type: "text" | "url" | "number" | "enum" | "relation" | "date" | "rich_text" | "count";
  options?: string[];
  multiple?: boolean;
  relation?: string;
}

export interface CollectionSpec {
  /** URL segment, e.g. `products`. */
  slug: string;
  /** Display name, matching what Canopy showed. */
  name: string;
  fields: FieldSpec[];
}

/**
 * The storefront renders one badge per product, so "Sales type" stays a single
 * string on the wire. Two of its three values are flags the client ticks; the
 * third is earned from order volume and wins when a product qualifies.
 */
export const SALES_TYPES = ["Best seller", "Limited", "New in"] as const;

function salesTypeFor(
  product: { isNewIn: boolean; isLimited: boolean },
  isBestSeller: boolean
): string | undefined {
  if (isBestSeller) return "Best seller";
  // Limited beats New in: scarcity is the more time-sensitive message, and a
  // limited run is usually new anyway.
  if (product.isLimited) return "Limited";
  if (product.isNewIn) return "New in";
  return undefined;
}

export const COLLECTIONS: Record<string, CollectionSpec> = {
  products: {
    slug: "products",
    name: "Products",
    fields: [
      { name: "Slug", type: "text" },
      { name: "Title", type: "text" },
      { name: "Cover img 1", type: "url" },
      { name: "Img 2", type: "url" },
      { name: "Img 3", type: "url" },
      { name: "Img 4", type: "url" },
      { name: "Price", type: "number" },
      { name: "Discount", type: "number" },
      { name: "Collections", type: "relation", multiple: false, relation: "collections" },
      { name: "Sales type", type: "enum", options: [...SALES_TYPES], multiple: false },
      { name: "Category", type: "relation", multiple: false, relation: "categories" },
      { name: "Brand", type: "relation", multiple: false, relation: "brands" },
      { name: "Skin Type", type: "relation", multiple: true, relation: "skin-types" },
      { name: "SKU", type: "number" },
      { name: "Size", type: "text" },
      { name: "Key Ingredients", type: "text" },
      { name: "Description", type: "text" },
      { name: "Created", type: "date" },
      { name: "Edited", type: "date" },
    ],
  },
  brands: {
    slug: "brands",
    name: "Brands",
    fields: [
      { name: "Slug", type: "text" },
      { name: "Title", type: "text" },
      { name: "Product counts", type: "count" },
    ],
  },
  categories: {
    slug: "categories",
    name: "Categories",
    fields: [
      { name: "Slug", type: "text" },
      { name: "Title", type: "text" },
    ],
  },
  collections: {
    slug: "collections",
    name: "Collections",
    fields: [
      { name: "Slug", type: "text" },
      { name: "Title", type: "text" },
      { name: "Product counts", type: "count" },
    ],
  },
  "skin-types": {
    slug: "skin-types",
    name: "Skin Type",
    fields: [
      { name: "Title", type: "text" },
      { name: "Slug", type: "text" },
    ],
  },
  // New in this database — Canopy never had it, so unlike the collections above
  // there is no legacy shape to match. It still follows the Slug/Title
  // convention so the storefront reads it exactly like the others.
  ticker: {
    slug: "ticker",
    name: "Ticker",
    fields: [
      { name: "Slug", type: "text" },
      { name: "Title", type: "text" },
    ],
  },
  "utility-pages": {
    slug: "utility-pages",
    name: "Utility Pages",
    fields: [
      { name: "Slug", type: "text" },
      { name: "Title", type: "text" },
      { name: "Content", type: "rich_text" },
    ],
  },
  orders: {
    slug: "orders",
    name: "Orders",
    fields: [
      { name: "Name", type: "text" },
      { name: "Phone", type: "text" },
      { name: "Address", type: "text" },
      { name: "City", type: "text" },
      { name: "Notes", type: "text" },
      { name: "Payment", type: "text" },
      { name: "Total", type: "number" },
      { name: "Items", type: "text" },
    ],
  },
};

// ── value formatting ─────────────────────────────────────────────────────────

/** `120.00` → `"120"`, `19.90` → `"19.9"`. Canopy stored these as plain text. */
function money(value: Prisma.Decimal | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(Number(value));
}

/** Dates the client edits are calendar days, not instants. */
function day(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined;
}

/** Canopy dropped empty fields from an entry rather than sending nulls. */
function compact(entry: Wire): Wire {
  const out: Wire = {};
  for (const [key, value] of Object.entries(entry)) {
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

interface RefRow {
  id: string;
  slug: string;
  title: string;
}

function ref(row: RefRow | null | undefined): Wire | undefined {
  if (!row) return undefined;
  return { id: row.id, Slug: row.slug, Title: row.title };
}

// ── serializers ──────────────────────────────────────────────────────────────

const productSelect = {
  id: true,
  slug: true,
  title: true,
  coverImage: true,
  image2: true,
  image3: true,
  image4: true,
  price: true,
  discount: true,
  sku: true,
  size: true,
  keyIngredients: true,
  description: true,
  isNewIn: true,
  isLimited: true,
  // "Created" and "Edited" on the wire are the row's own timestamps — the
  // client never picks these dates by hand.
  createdAt: true,
  updatedAt: true,
  brand: { select: { id: true, slug: true, title: true } },
  category: { select: { id: true, slug: true, title: true } },
  collection: { select: { id: true, slug: true, title: true } },
  skinTypes: {
    select: { skinType: { select: { id: true, slug: true, title: true } } },
  },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

function serializeProduct(p: ProductRow, isBestSeller: boolean): Wire {
  const skinTypes = p.skinTypes.map((link) => ref(link.skinType)!);

  return compact({
    id: p.id,
    Slug: p.slug,
    Title: p.title,
    "Cover img 1": p.coverImage,
    "Img 2": p.image2,
    "Img 3": p.image3,
    "Img 4": p.image4,
    Price: money(p.price),
    // A zero discount is meaningful to the storefront's badge logic, so unlike
    // the other empty values it is always sent.
    Discount: String(p.discount),
    "Sales type": salesTypeFor(p, isBestSeller),
    Collections: ref(p.collection),
    Category: ref(p.category),
    Brand: ref(p.brand),
    "Skin Type": skinTypes.length > 0 ? skinTypes : undefined,
    SKU: p.sku,
    Size: p.size,
    "Key Ingredients": p.keyIngredients,
    Description: p.description,
    Created: day(p.createdAt),
    Edited: day(p.updatedAt),
  });
}

export interface PageArgs {
  page: number;
  limit: number;
}

export interface PagedResult {
  data: Wire[];
  total: number;
}

/** Reads one public collection. Archived rows are never exposed. */
export async function readCollection(
  slug: string,
  { page, limit }: PageArgs
): Promise<PagedResult | null> {
  const skip = (page - 1) * limit;
  const live = { archivedAt: null };
  const order = [{ sortIndex: "asc" as const }, { createdAt: "asc" as const }];

  switch (slug) {
    case "products": {
      const [total, rows, bestSellers] = await Promise.all([
        prisma.product.count({ where: live }),
        prisma.product.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: productSelect,
        }),
        bestSellerIds(),
      ]);
      return { total, data: rows.map((p) => serializeProduct(p, bestSellers.has(p.id))) };
    }

    case "brands": {
      const [total, rows] = await Promise.all([
        prisma.brand.count({ where: live }),
        prisma.brand.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: {
            id: true,
            slug: true,
            title: true,
            _count: { select: { products: { where: live } } },
          },
        }),
      ]);
      return {
        total,
        data: rows.map((b) =>
          compact({
            id: b.id,
            Slug: b.slug,
            Title: b.title,
            // Canopy computed this; here it falls out of the relation.
            "Product counts": String(b._count.products),
          })
        ),
      };
    }

    case "categories": {
      const [total, rows] = await Promise.all([
        prisma.category.count({ where: live }),
        prisma.category.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: { id: true, slug: true, title: true },
        }),
      ]);
      return {
        total,
        data: rows.map((c) => compact({ id: c.id, Slug: c.slug, Title: c.title })),
      };
    }

    case "collections": {
      const [total, rows] = await Promise.all([
        prisma.collection.count({ where: live }),
        prisma.collection.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: {
            id: true,
            slug: true,
            title: true,
            _count: { select: { products: { where: live } } },
          },
        }),
      ]);
      return {
        total,
        data: rows.map((c) =>
          compact({
            id: c.id,
            Slug: c.slug,
            Title: c.title,
            "Product counts": String(c._count.products),
          })
        ),
      };
    }

    case "skin-types": {
      const [total, rows] = await Promise.all([
        prisma.skinType.count({ where: live }),
        prisma.skinType.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: { id: true, slug: true, title: true },
        }),
      ]);
      return {
        total,
        data: rows.map((s) => compact({ id: s.id, Slug: s.slug, Title: s.title })),
      };
    }

    case "ticker": {
      const [total, rows] = await Promise.all([
        prisma.tickerItem.count({ where: live }),
        prisma.tickerItem.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: { id: true, slug: true, title: true },
        }),
      ]);
      return {
        total,
        data: rows.map((t) => compact({ id: t.id, Slug: t.slug, Title: t.title })),
      };
    }

    case "utility-pages": {
      const [total, rows] = await Promise.all([
        prisma.utilityPage.count({ where: live }),
        prisma.utilityPage.findMany({
          where: live,
          orderBy: order,
          skip,
          take: limit,
          select: { id: true, slug: true, title: true, content: true },
        }),
      ]);
      return {
        total,
        data: rows.map((u) =>
          compact({ id: u.id, Slug: u.slug, Title: u.title, Content: u.content })
        ),
      };
    }

    default:
      return null;
  }
}
