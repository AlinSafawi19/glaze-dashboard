import "server-only";

import type { Prisma } from "@prisma/client";

import { bestSellerIds } from "@/lib/best-sellers";
import { prisma } from "@/lib/prisma";
import { NON_ALPHA, type CollectionQuery, type Sort } from "@/lib/public-api-query";
import { BY_ADDED, BY_NAME } from "@/lib/resources";

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
      { name: "Category", type: "relation", multiple: true, relation: "categories" },
      { name: "Brand", type: "relation", multiple: false, relation: "brands" },
      { name: "Skin Type", type: "relation", multiple: true, relation: "skin-types" },
      { name: "SKU", type: "number" },
      { name: "Stock", type: "number" },
      { name: "In stock", type: "text" },
      { name: "Size", type: "text" },
      { name: "Key Ingredients", type: "text" },
      { name: "Description", type: "text" },
      { name: "Best For", type: "text" },
      { name: "Benefits", type: "text" },
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
  stock: true,
  size: true,
  keyIngredients: true,
  description: true,
  bestFor: true,
  benefits: true,
  isNewIn: true,
  isLimited: true,
  // "Created" and "Edited" on the wire are the row's own timestamps — the
  // client never picks these dates by hand.
  createdAt: true,
  updatedAt: true,
  brand: { select: { id: true, slug: true, title: true } },
  categories: {
    select: { category: { select: { id: true, slug: true, title: true } } },
  },
  collection: { select: { id: true, slug: true, title: true } },
  skinTypes: {
    select: { skinType: { select: { id: true, slug: true, title: true } } },
  },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

function serializeProduct(p: ProductRow, isBestSeller: boolean): Wire {
  const categories = p.categories.map((link) => ref(link.category)!);
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
    // Both go out: "Stock" is the count, for anything that wants to say "2
    // left"; "In stock" is the yes/no a card actually renders. A product the
    // shop does not count sends neither, and the storefront reads that absence
    // as "always available" — the same thing null means in the database.
    Stock: p.stock === null ? undefined : String(p.stock),
    "In stock": p.stock === null ? undefined : p.stock > 0 ? "yes" : "no",
    "Sales type": salesTypeFor(p, isBestSeller),
    Collections: ref(p.collection),
    // A list now, like "Skin Type" — the key stays singular because that is
    // what the storefront reads, and it accepts either shape.
    Category: categories.length > 0 ? categories : undefined,
    Brand: ref(p.brand),
    "Skin Type": skinTypes.length > 0 ? skinTypes : undefined,
    SKU: p.sku,
    Size: p.size,
    "Key Ingredients": p.keyIngredients,
    Description: p.description,
    "Best For": p.bestFor,
    Benefits: p.benefits,
    Created: day(p.createdAt),
    Edited: day(p.updatedAt),
  });
}

export interface PagedResult {
  data: Wire[];
  total: number;
  /** Present only when the query asked for it. */
  facets?: { initials?: string[] };
}

// -- query translation -------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Live rows only - an archived row is never exposed over this API. */
const LIVE = { archivedAt: null } as const;

/**
 * The subset of a `where` input that every public collection shares. Written
 * out rather than borrowed from one model's generated type, so it cannot pick
 * up a field the others do not have.
 */
type CommonWhere = {
  archivedAt?: null;
  slug?:  { in?: string[]; notIn?: string[] };
  title?: { contains?: string; startsWith?: string; mode?: "insensitive" };
  AND?:   CommonWhere[];
  NOT?:   { OR: CommonWhere[] };
};

/**
 * `startsWith` as a `where` fragment. A letter is a prefix match; `#` is
 * everything a letter would not have caught, which is how the storefront's A-Z
 * index groups digits and punctuation.
 */
function initialWhere(initial: string): CommonWhere {
  if (initial !== NON_ALPHA) {
    return { title: { startsWith: initial, mode: "insensitive" } };
  }
  return {
    NOT: {
      OR: ALPHABET.map((letter) => ({
        title: { startsWith: letter, mode: "insensitive" as const },
      })),
    },
  };
}

/**
 * The `where` fragment every collection understands, since each one is a row
 * with `slug`, `title` and `archivedAt`.
 *
 * Prisma generates a separate `WhereInput` per model and they are not mutually
 * assignable, even where the fields used are identical. Rather than repeat a
 * cast at each of the seven call sites, the caller names the model's input type
 * and the single cast lives here.
 */
function commonWhere<W>(query: CollectionQuery): W {
  const and: CommonWhere[] = [LIVE];

  if (query.slugs.length > 0)   and.push({ slug: { in: query.slugs } });
  if (query.exclude.length > 0) and.push({ slug: { notIn: query.exclude } });
  if (query.search)             and.push({ title: { contains: query.search, mode: "insensitive" } });
  if (query.startsWith)         and.push(initialWhere(query.startsWith));

  return { AND: and } as W;
}

/** Product filters sit on top of the common ones. */
function productWhere(query: CollectionQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [commonWhere<Prisma.ProductWhereInput>(query)];

  // Within one filter the values are alternatives; across filters they narrow.
  // "Cleanser or toner, by this brand" is what the shop's panel means when two
  // boxes are ticked in one group and one in another.
  if (query.categories.length > 0) {
    and.push({ categories: { some: { category: { slug: { in: query.categories } } } } });
  }
  if (query.brands.length > 0) {
    and.push({ brand: { slug: { in: query.brands } } });
  }
  if (query.collections.length > 0) {
    and.push({ collection: { slug: { in: query.collections } } });
  }
  if (query.skinTypes.length > 0) {
    and.push({ skinTypes: { some: { skinType: { slug: { in: query.skinTypes } } } } });
  }

  return { AND: and };
}

/** Orderings expressible on every collection - no model-specific column. */
type CommonOrderBy = { title?: "asc" | "desc"; sortIndex?: "asc" | "desc"; createdAt?: "asc" | "desc" }[];

/**
 * Cast for the same reason {@link commonWhere} is: `title` and `createdAt`
 * order every one of these models, but Prisma types the input per model.
 * `price` never reaches here - `validateForCollection` turns it away before
 * a non-product collection is read.
 */
function commonOrder<O>(sort: Sort | null, fallback: CommonOrderBy): O {
  switch (sort) {
    case "name":   return BY_NAME as O;
    case "newest": return [{ createdAt: "desc" }] as O;
    case "oldest": return [{ createdAt: "asc" }] as O;
    case "added":  return BY_ADDED as O;
    default:       return fallback as O;
  }
}

function productOrder(sort: Sort | null): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "price")  return [{ price: "asc" }];
  if (sort === "-price") return [{ price: "desc" }];
  return commonOrder<Prisma.ProductOrderByWithRelationInput[]>(sort, BY_ADDED);
}

/**
 * Every distinct first letter across a collection, for an A-Z index that has to
 * know which letters are worth offering without holding the list itself. Titles
 * only, so the cost stays a single narrow column.
 */
async function initialsOf(
  model: { findMany: (args: unknown) => Promise<{ title: string }[]> },
  where: unknown,
): Promise<string[]> {
  const rows = await model.findMany({ where, select: { title: true } });
  const seen = new Set<string>();
  for (const row of rows) {
    const first = row.title.trim().charAt(0).toUpperCase();
    seen.add(ALPHABET.includes(first) ? first : NON_ALPHA);
  }
  return [...seen].sort();
}

/**
 * Reads one public collection. Archived rows are never exposed.
 *
 * Filtering, searching, sorting and paging all happen in the database, so what
 * comes back is the page the caller asked for - never a slice that still has to
 * be narrowed at the other end.
 */
export async function readCollection(
  slug: string,
  query: CollectionQuery
): Promise<PagedResult | null> {
  const { page, limit } = query;
  const skip = (page - 1) * limit;
  const wantsInitials = query.facets.includes("initials");

  switch (slug) {
    case "products": {
      const where = productWhere(query);
      const [total, rows, bestSellers] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy: productOrder(query.sort),
          skip,
          take: limit,
          select: productSelect,
        }),
        bestSellerIds(),
      ]);
      return { total, data: rows.map((p) => serializeProduct(p, bestSellers.has(p.id))) };
    }

    case "brands": {
      const where = commonWhere<Prisma.BrandWhereInput>(query);
      const [total, rows, initials] = await Promise.all([
        prisma.brand.count({ where }),
        prisma.brand.findMany({
          where,
          // The storefront renders brands as an A-Z index, so they are sorted
          // by name here rather than by when the shop added them.
          orderBy: commonOrder<Prisma.BrandOrderByWithRelationInput[]>(query.sort, BY_NAME),
          skip,
          take: limit,
          select: {
            id: true,
            slug: true,
            title: true,
            _count: { select: { products: { where: LIVE } } },
          },
        }),
        // Deliberately across every live brand, not the filtered set: the index
        // has to keep offering the other letters once one has been picked.
        wantsInitials ? initialsOf(prisma.brand as never, LIVE) : undefined,
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
        ...(initials ? { facets: { initials } } : {}),
      };
    }

    case "categories": {
      const where = commonWhere<Prisma.CategoryWhereInput>(query);
      const [total, rows] = await Promise.all([
        prisma.category.count({ where }),
        prisma.category.findMany({
          where,
          orderBy: commonOrder<Prisma.CategoryOrderByWithRelationInput[]>(query.sort, BY_ADDED),
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
      const where = commonWhere<Prisma.CollectionWhereInput>(query);
      const [total, rows] = await Promise.all([
        prisma.collection.count({ where }),
        prisma.collection.findMany({
          where,
          orderBy: commonOrder<Prisma.CollectionOrderByWithRelationInput[]>(query.sort, BY_ADDED),
          skip,
          take: limit,
          select: {
            id: true,
            slug: true,
            title: true,
            _count: { select: { products: { where: LIVE } } },
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
      const where = commonWhere<Prisma.SkinTypeWhereInput>(query);
      const [total, rows] = await Promise.all([
        prisma.skinType.count({ where }),
        prisma.skinType.findMany({
          where,
          orderBy: commonOrder<Prisma.SkinTypeOrderByWithRelationInput[]>(query.sort, BY_ADDED),
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
      const where = commonWhere<Prisma.TickerItemWhereInput>(query);
      const [total, rows] = await Promise.all([
        prisma.tickerItem.count({ where }),
        prisma.tickerItem.findMany({
          where,
          orderBy: commonOrder<Prisma.TickerItemOrderByWithRelationInput[]>(query.sort, BY_ADDED),
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
      const where = commonWhere<Prisma.UtilityPageWhereInput>(query);
      const [total, rows] = await Promise.all([
        prisma.utilityPage.count({ where }),
        prisma.utilityPage.findMany({
          where,
          orderBy: commonOrder<Prisma.UtilityPageOrderByWithRelationInput[]>(query.sort, BY_ADDED),
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
