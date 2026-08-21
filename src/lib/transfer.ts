import "server-only";

import { prisma } from "@/lib/prisma";
import { normaliseHeader, toCsv, type Row } from "@/lib/csv";
import { skuIssuer } from "@/lib/sku";
import { uniqueSlug } from "@/lib/slug";
import { taxonomyDelegate } from "@/lib/taxonomy-delegate";
import { toXlsx, type XlsxDropdown } from "@/lib/xlsx";

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
  /** Export columns — the whole record, dashboard-managed fields included. */
  headers: string[];
  /**
   * Import columns: `headers` minus everything the dashboard owns — the
   * generated slug and SKU, and the image URLs, which come from the uploader.
   * The template does not offer them, and the importer ignores them if a
   * hand-made file carries them anyway.
   */
  importHeaders: string[];
  /** One filled-in row, so the sample file shows the expected shape. */
  sample: Row;
  notes: string[];
}

/** Columns the dashboard fills in itself, so a spreadsheet cannot set them. */
const DASHBOARD_OWNED = ["Slug", "Cover img 1", "Img 2", "Img 3", "Img 4", "SKU"];

const forImport = (headers: string[]): string[] =>
  headers.filter((header) => !DASHBOARD_OWNED.includes(header));

const TAXONOMY_HEADERS = ["Slug", "Title"];

/** A product's own fields; its skin types follow in numbered columns. */
const PRODUCT_COLUMNS = [
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
];

/**
 * A product wears several skin types but an Excel dropdown holds one value, so
 * they get a numbered column each. Three is what the template offers; an export
 * widens to fit the product wearing the most, and the importer reads whatever
 * numbered columns a file actually has.
 */
const SKIN_TYPE_COLUMNS = 3;

const skinTypeHeaders = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `Skin Type ${index + 1}`);

const productHeaders = (skinTypeCount: number): string[] => [
  ...PRODUCT_COLUMNS,
  ...skinTypeHeaders(skinTypeCount),
];

const PRODUCT_HEADERS = productHeaders(SKIN_TYPE_COLUMNS);

const TAXONOMY_NOTES = [
  "Title is the only column.",
  "The slug is made from the title automatically — there is nothing to fill in.",
  "A row whose title already exists updates that record instead of adding a second.",
];

export const TRANSFERS: Record<TransferKey, TransferSpec> = {
  brands: {
    key: "brands",
    label: "Brands",
    headers: TAXONOMY_HEADERS,
    importHeaders: forImport(TAXONOMY_HEADERS),
    sample: { Title: "Clinique" },
    notes: TAXONOMY_NOTES,
  },
  categories: {
    key: "categories",
    label: "Categories",
    headers: TAXONOMY_HEADERS,
    importHeaders: forImport(TAXONOMY_HEADERS),
    sample: { Title: "Cleanser" },
    notes: TAXONOMY_NOTES,
  },
  collections: {
    key: "collections",
    label: "Collections",
    headers: TAXONOMY_HEADERS,
    importHeaders: forImport(TAXONOMY_HEADERS),
    sample: { Title: "SkinCare" },
    notes: TAXONOMY_NOTES,
  },
  "skin-types": {
    key: "skin-types",
    label: "Skin types",
    headers: TAXONOMY_HEADERS,
    importHeaders: forImport(TAXONOMY_HEADERS),
    sample: { Title: "Sensitive" },
    notes: TAXONOMY_NOTES,
  },
  products: {
    key: "products",
    label: "Products",
    headers: PRODUCT_HEADERS,
    importHeaders: forImport(PRODUCT_HEADERS),
    sample: {
      Title: "Marble Mortar",
      Price: "120",
      Discount: "10",
      Size: "125ml — 14.9% vol.",
      "Key Ingredients": "Mineral Clay, Shea Butter",
      Description: "Smooth, rich, essential.",
      "New in": "no",
      Limited: "yes",
      Brand: "Clinique",
      Category: "Cleanser",
      Collection: "Offers",
      "Skin Type 1": "Dry",
      "Skin Type 2": "Sensitive",
    },
    notes: [
      "Title is the only required column.",
      "Brand, Category, Collection and the Skin Type columns are dropdowns in the Excel file — pick from what the shop already has. An unknown name is reported, never created.",
      "New in and Limited accept yes/no, true/false or 1/0.",
      "The slug and the SKU are issued automatically — there is nothing to fill in.",
      "Images are uploaded on the product's own page; an import never touches them.",
      "A row whose title already exists updates that product instead of adding a second.",
    ],
  },
};

// ── export ───────────────────────────────────────────────────────────────────

const ORDER = [{ sortIndex: "asc" as const }, { createdAt: "asc" as const }];

/** The product sheet: its rows and the header row wide enough to hold them. */
async function productSheet(): Promise<{ headers: string[]; rows: Row[] }> {
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    orderBy: ORDER,
    include: {
      brand: { select: { title: true } },
      category: { select: { title: true } },
      collection: { select: { title: true } },
      skinTypes: { select: { skinType: { select: { title: true } } } },
    },
  });

  const widest = Math.max(
    SKIN_TYPE_COLUMNS,
    ...products.map((product) => product.skinTypes.length)
  );

  const rows = products.map((product) => {
    const row: Row = {
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
    };

    product.skinTypes.forEach((link, index) => {
      row[`Skin Type ${index + 1}`] = link.skinType.title;
    });

    return row;
  });

  return { headers: productHeaders(widest), rows };
}

/**
 * The dropdown lists, straight from the live tables. A blank list simply means
 * no validation on that column — an empty range is not a legal one in Excel.
 */
async function productDropdowns(headers: string[]): Promise<XlsxDropdown[]> {
  const live = { archivedAt: null };
  const select = { title: true };
  const titles = (rows: Array<{ title: string }>) => rows.map((row) => row.title);

  const [brands, categories, collections, skinTypes] = await Promise.all([
    prisma.brand.findMany({ where: live, orderBy: ORDER, select }),
    prisma.category.findMany({ where: live, orderBy: ORDER, select }),
    prisma.collection.findMany({ where: live, orderBy: ORDER, select }),
    prisma.skinType.findMany({ where: live, orderBy: ORDER, select }),
  ]);

  return [
    { label: "Brands", headers: ["Brand"], values: titles(brands) },
    { label: "Categories", headers: ["Category"], values: titles(categories) },
    { label: "Collections", headers: ["Collection"], values: titles(collections) },
    {
      label: "Skin types",
      headers: headers.filter((header) => header.startsWith("Skin Type")),
      values: titles(skinTypes),
    },
  ];
}

/**
 * Products export as a real workbook rather than a comma file: the relation
 * columns come with dropdowns of what the shop actually stocks, which is the
 * difference between a typo and a rejected row at import time.
 */
export async function exportProductsXlsx(): Promise<Uint8Array> {
  const { headers, rows } = await productSheet();
  return toXlsx({
    sheetName: "Products",
    headers,
    rows,
    dropdowns: await productDropdowns(headers),
  });
}

/** The same workbook with one example row and no catalogue in it. */
export async function sampleProductsXlsx(): Promise<Uint8Array> {
  const headers = TRANSFERS.products.importHeaders;
  return toXlsx({
    sheetName: "Products",
    headers,
    rows: [TRANSFERS.products.sample],
    dropdowns: await productDropdowns(headers),
  });
}

export async function exportRows(key: TransferKey): Promise<Row[]> {
  const order = ORDER;
  const live = { archivedAt: null };

  if (key === "products") return (await productSheet()).rows;

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
  return toCsv(spec.importHeaders, [spec.sample]);
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

/** Far more numbered columns than any catalogue needs, so the scan always ends. */
const MAX_SKIN_TYPE_COLUMNS = 20;

/**
 * Skin types come in as numbered dropdown columns. A file written before they
 * were split apart holds them in one semicolon-separated cell instead, so both
 * are read and an older spreadsheet still imports.
 */
function skinTypeNames(row: Row): string[] {
  const names = cell(row, "Skin Types").split(";");

  for (let column = 1; column <= MAX_SKIN_TYPE_COLUMNS; column += 1) {
    names.push(cell(row, `Skin Type ${column}`));
  }

  return names.map((name) => name.trim()).filter(Boolean);
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

    try {
      // Title is the match key now that slugs are generated: an import cannot
      // name an existing record any other way, and matching stops a re-import
      // of the same file from doubling the list.
      const existing = await delegate.findFirst({
        where: { title: { equals: title, mode: "insensitive" }, archivedAt: null },
        select: { id: true },
      });

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
            slug: await uniqueSlug(model, title),
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

  // Codes are handed out from one pass over the existing ones, so a file of
  // hundreds of new products does not re-read the table for every row.
  const issueSku = await skuIssuer();

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

    const skinTypeIds = [
      ...new Set(
        skinTypeNames(row)
          .map((name) => resolve(skinTypeIndex, name, "skin type", index))
          .filter((id): id is string => Boolean(id))
      ),
    ];

    // No image fields: they are uploaded in the dashboard, and leaving them out
    // of the update keeps pictures a spreadsheet has no way to carry.
    const data = {
      title,
      price: price.toFixed(2),
      discount,
      size: cell(row, "Size") || null,
      keyIngredients: cell(row, "Key Ingredients") || null,
      description: cell(row, "Description") || null,
      isNewIn: boolean(cell(row, "New in")),
      isLimited: boolean(cell(row, "Limited")),
      brandId: resolve(brandIndex, cell(row, "Brand"), "brand", index),
      categoryId: resolve(categoryIndex, cell(row, "Category"), "category", index),
      collectionId: resolve(collectionIndex, cell(row, "Collection"), "collection", index),
    };

    try {
      const existing = await prisma.product.findFirst({
        where: { title: { equals: title, mode: "insensitive" }, archivedAt: null },
        select: { id: true, sku: true },
      });

      if (existing) {
        await prisma.$transaction([
          prisma.product.update({
            where: { id: existing.id },
            // A product from before SKUs were issued picks one up here; one that
            // already has a code keeps it, because paperwork quotes it.
            data: existing.sku ? data : { ...data, sku: issueSku() },
          }),
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
            slug: await uniqueSlug("product", title),
            sku: issueSku(),
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
