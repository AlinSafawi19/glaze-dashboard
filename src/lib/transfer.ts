import "server-only";

import { prisma } from "@/lib/prisma";
import { normaliseHeader, toCsv, type Row } from "@/lib/csv";
import { uniqueSlug } from "@/lib/slug";
import { taxonomyDelegate } from "@/lib/taxonomy-delegate";

/**
 * Spreadsheet import and export.
 *
 * The guiding rule for import: **never invent a relation.** A product row that
 * names a brand we do not stock is reported back by name rather than quietly
 * creating that brand or silently dropping the link — either would leave the
 * catalogue subtly wrong in a way nobody would notice until a customer did.
 */

export type TransferKey =
  | "brands"
  | "categories"
  | "collections"
  | "skin-types"
  | "products";

export interface TransferSpec {
  key: TransferKey;
  label: string;
  headers: string[];
  /** One filled-in row, so the sample file shows the expected shape. */
  sample: Row;
  notes: string[];
}

const TAXONOMY_NOTES = [
  "Title is the only required column.",
  "Slug is optional — leave it blank and one is made from the title.",
  "A row whose slug already exists updates that record instead of adding a second.",
];

export const TRANSFERS: Record<TransferKey, TransferSpec> = {
  brands: {
    key: "brands",
    label: "Brands",
    headers: ["Slug", "Title"],
    sample: { Slug: "clinique", Title: "Clinique" },
    notes: TAXONOMY_NOTES,
  },
  categories: {
    key: "categories",
    label: "Categories",
    headers: ["Slug", "Title"],
    sample: { Slug: "cleanser", Title: "Cleanser" },
    notes: TAXONOMY_NOTES,
  },
  collections: {
    key: "collections",
    label: "Collections",
    headers: ["Slug", "Title"],
    sample: { Slug: "skin-care", Title: "SkinCare" },
    notes: TAXONOMY_NOTES,
  },
  "skin-types": {
    key: "skin-types",
    label: "Skin types",
    headers: ["Slug", "Title"],
    sample: { Slug: "sensitive", Title: "Sensitive" },
    notes: TAXONOMY_NOTES,
  },
  products: {
    key: "products",
    label: "Products",
    headers: [
      "Slug",
      "Title",
      "Cover img 1",
      "Img 2",
      "Img 3",
      "Img 4",
      "Price",
      "Discount",
      "SKU",
      "Size",
      "Key Ingredients",
      "Description",
      "New in",
      "Limited",
      "Brand",
      "Category",
      "Collection",
      "Skin Types",
    ],
    sample: {
      Slug: "marble-mortar",
      Title: "Marble Mortar",
      "Cover img 1": "https://example.com/cover.png",
      "Img 2": "",
      "Img 3": "",
      "Img 4": "",
      Price: "120",
      Discount: "10",
      SKU: "15509",
      Size: "125ml — 14.9% vol.",
      "Key Ingredients": "Mineral Clay, Shea Butter",
      Description: "Smooth, rich, essential.",
      "New in": "no",
      Limited: "yes",
      Brand: "Clinique",
      Category: "Cleanser",
      Collection: "Offers",
      "Skin Types": "Dry; Sensitive",
    },
    notes: [
      "Title is the only required column.",
      "Brand, Category and Collection must already exist — match by name or slug. An unknown name is reported, never created.",
      "Skin Types takes several, separated by a semicolon.",
      "New in and Limited accept yes/no, true/false or 1/0.",
      "A row whose slug already exists updates that product instead of adding a second.",
    ],
  },
};

// ── export ───────────────────────────────────────────────────────────────────

export async function exportRows(key: TransferKey): Promise<Row[]> {
  const order = [{ sortIndex: "asc" as const }, { createdAt: "asc" as const }];
  const live = { archivedAt: null };

  if (key === "products") {
    const products = await prisma.product.findMany({
      where: live,
      orderBy: order,
      include: {
        brand: { select: { title: true } },
        category: { select: { title: true } },
        collection: { select: { title: true } },
        skinTypes: { select: { skinType: { select: { title: true } } } },
      },
    });

    return products.map((product) => ({
      Slug: product.slug,
      Title: product.title,
      "Cover img 1": product.coverImage ?? "",
      "Img 2": product.image2 ?? "",
      "Img 3": product.image3 ?? "",
      "Img 4": product.image4 ?? "",
      Price: String(Number(product.price)),
      Discount: String(product.discount),
      SKU: product.sku ?? "",
      Size: product.size ?? "",
      "Key Ingredients": product.keyIngredients ?? "",
      Description: product.description ?? "",
      "New in": product.isNewIn ? "yes" : "no",
      Limited: product.isLimited ? "yes" : "no",
      Brand: product.brand?.title ?? "",
      Category: product.category?.title ?? "",
      Collection: product.collection?.title ?? "",
      "Skin Types": product.skinTypes.map((link) => link.skinType.title).join("; "),
    }));
  }

  const select = { slug: true, title: true };
  const rows =
    key === "brands"
      ? await prisma.brand.findMany({ where: live, orderBy: order, select })
      : key === "categories"
        ? await prisma.category.findMany({ where: live, orderBy: order, select })
        : key === "collections"
          ? await prisma.collection.findMany({ where: live, orderBy: order, select })
          : await prisma.skinType.findMany({ where: live, orderBy: order, select });

  return rows.map((row) => ({ Slug: row.slug, Title: row.title }));
}

export async function exportCsv(key: TransferKey): Promise<string> {
  return toCsv(TRANSFERS[key].headers, await exportRows(key));
}

export function sampleCsv(key: TransferKey): string {
  const spec = TRANSFERS[key];
  return toCsv(spec.headers, [spec.sample]);
}

// ── import ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** Human-readable, row-numbered, and capped so one bad file cannot flood. */
  problems: string[];
}

const MAX_PROBLEMS = 25;
const MAX_ROWS = 2000;

/** Row numbers are 1-based and count the header, matching what a spreadsheet shows. */
const at = (index: number) => `Row ${index + 2}`;

function cell(row: Row, header: string): string {
  return row[normaliseHeader(header)] ?? "";
}

function boolean(value: string): boolean {
  return ["yes", "true", "1", "y"].includes(value.trim().toLowerCase());
}

/** Lets a spreadsheet name a relation by either its display name or its slug. */
function lookupIndex(rows: Array<{ id: string; title: string; slug: string }>) {
  const index = new Map<string, string>();
  for (const row of rows) {
    index.set(row.title.trim().toLowerCase(), row.id);
    index.set(row.slug.trim().toLowerCase(), row.id);
  }
  return index;
}

export async function importCsv(key: TransferKey, rows: Row[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, problems: [] };

  if (rows.length === 0) {
    result.problems.push("That file has no rows under its header.");
    return result;
  }
  if (rows.length > MAX_ROWS) {
    result.problems.push(
      `That file has ${rows.length} rows; ${MAX_ROWS} is the limit for one import.`
    );
    return result;
  }

  const note = (message: string) => {
    if (result.problems.length < MAX_PROBLEMS) result.problems.push(message);
  };

  return key === "products"
    ? importProducts(rows, result, note)
    : importTaxonomy(key, rows, result, note);
}

async function importTaxonomy(
  key: Exclude<TransferKey, "products">,
  rows: Row[],
  result: ImportResult,
  note: (message: string) => void
): Promise<ImportResult> {
  const model = (
    { brands: "brand", categories: "category", collections: "collection", "skin-types": "skinType" } as const
  )[key];

  const delegate = taxonomyDelegate(model);

  for (const [index, row] of rows.entries()) {
    const title = cell(row, "Title");
    if (!title) {
      result.skipped += 1;
      note(`${at(index)}: no title, so nothing to create.`);
      continue;
    }

    const slug = cell(row, "Slug");

    try {
      const existing = slug
        ? await delegate.findUnique({ where: { slug }, select: { id: true } })
        : null;

      if (existing) {
        await delegate.update({ where: { id: existing.id }, data: { title } });
        result.updated += 1;
      } else {
        const last = await delegate.findFirst({
          orderBy: { sortIndex: "desc" },
          select: { sortIndex: true },
        });
        await delegate.create({
          data: {
            title,
            slug: slug || (await uniqueSlug(model, title)),
            sortIndex: (last?.sortIndex ?? -1) + 1,
          },
        });
        result.created += 1;
      }
    } catch (error) {
      result.skipped += 1;
      note(`${at(index)}: could not save “${title}”.`);
      console.error(`[import ${key}]`, error);
    }
  }

  return result;
}

async function importProducts(
  rows: Row[],
  result: ImportResult,
  note: (message: string) => void
): Promise<ImportResult> {
  // Load the relation tables once — an import of 500 rows must not run 2,000
  // lookups, and matching happens entirely in memory.
  const [brands, categories, collections, skinTypes] = await Promise.all([
    prisma.brand.findMany({ where: { archivedAt: null }, select: { id: true, title: true, slug: true } }),
    prisma.category.findMany({ where: { archivedAt: null }, select: { id: true, title: true, slug: true } }),
    prisma.collection.findMany({ where: { archivedAt: null }, select: { id: true, title: true, slug: true } }),
    prisma.skinType.findMany({ where: { archivedAt: null }, select: { id: true, title: true, slug: true } }),
  ]);

  const brandIndex = lookupIndex(brands);
  const categoryIndex = lookupIndex(categories);
  const collectionIndex = lookupIndex(collections);
  const skinTypeIndex = lookupIndex(skinTypes);

  /** Resolves one relation, reporting an unknown name rather than creating it. */
  function resolve(
    index: Map<string, string>,
    value: string,
    label: string,
    rowIndex: number
  ): string | null {
    const wanted = value.trim().toLowerCase();
    if (!wanted) return null;

    const id = index.get(wanted);
    if (!id) {
      note(`${at(rowIndex)}: no ${label} called “${value}” — left unset. Add it first, then re-import.`);
      return null;
    }
    return id;
  }

  for (const [index, row] of rows.entries()) {
    const title = cell(row, "Title");
    if (!title) {
      result.skipped += 1;
      note(`${at(index)}: no title, so nothing to create.`);
      continue;
    }

    const price = Number.parseFloat(cell(row, "Price") || "0");
    if (!Number.isFinite(price) || price < 0) {
      result.skipped += 1;
      note(`${at(index)}: “${cell(row, "Price")}” is not a valid price.`);
      continue;
    }

    const discountRaw = cell(row, "Discount") || "0";
    const discount = Number.parseInt(discountRaw, 10);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      result.skipped += 1;
      note(`${at(index)}: discount “${discountRaw}” must be a whole number from 0 to 100.`);
      continue;
    }

    const skinTypeIds = cell(row, "Skin Types")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((name) => resolve(skinTypeIndex, name, "skin type", index))
      .filter((id): id is string => Boolean(id));

    const data = {
      title,
      coverImage: cell(row, "Cover img 1") || null,
      image2: cell(row, "Img 2") || null,
      image3: cell(row, "Img 3") || null,
      image4: cell(row, "Img 4") || null,
      price: price.toFixed(2),
      discount,
      sku: cell(row, "SKU") || null,
      size: cell(row, "Size") || null,
      keyIngredients: cell(row, "Key Ingredients") || null,
      description: cell(row, "Description") || null,
      isNewIn: boolean(cell(row, "New in")),
      isLimited: boolean(cell(row, "Limited")),
      brandId: resolve(brandIndex, cell(row, "Brand"), "brand", index),
      categoryId: resolve(categoryIndex, cell(row, "Category"), "category", index),
      collectionId: resolve(collectionIndex, cell(row, "Collection"), "collection", index),
    };

    const slug = cell(row, "Slug");

    try {
      const existing = slug
        ? await prisma.product.findUnique({ where: { slug }, select: { id: true } })
        : null;

      if (existing) {
        await prisma.$transaction([
          prisma.product.update({ where: { id: existing.id }, data }),
          prisma.productSkinType.deleteMany({ where: { productId: existing.id } }),
          prisma.productSkinType.createMany({
            data: skinTypeIds.map((skinTypeId) => ({ productId: existing.id, skinTypeId })),
            skipDuplicates: true,
          }),
        ]);
        result.updated += 1;
      } else {
        const last = await prisma.product.findFirst({
          orderBy: { sortIndex: "desc" },
          select: { sortIndex: true },
        });
        await prisma.product.create({
          data: {
            ...data,
            slug: slug || (await uniqueSlug("product", title)),
            sortIndex: (last?.sortIndex ?? -1) + 1,
            skinTypes: { create: skinTypeIds.map((skinTypeId) => ({ skinTypeId })) },
          },
        });
        result.created += 1;
      }
    } catch (error) {
      result.skipped += 1;
      note(`${at(index)}: could not save “${title}”.`);
      console.error("[import products]", error);
    }
  }

  return result;
}
