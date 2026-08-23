import "server-only";

import { prisma } from "@/lib/prisma";
import { normaliseHeader, toCsv, type Row } from "@/lib/csv";
import { BY_ADDED, BY_NAME } from "@/lib/resources";
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

/**
 * Columns the dashboard fills in itself, so a spreadsheet cannot set them.
 *
 * The slug is no longer written into an export either — it is derived from the
 * title and never edited, so a column of it was one more thing to scroll past.
 * It stays named here so a hand-made file that still carries one has it
 * ignored rather than obeyed.
 */
const DASHBOARD_OWNED = ["Slug", "Cover img 1", "Img 2", "Img 3", "Img 4", "SKU"];

const forImport = (headers: string[]): string[] =>
  headers.filter((header) => !DASHBOARD_OWNED.includes(header));

const TAXONOMY_HEADERS = ["Title"];

/**
 * A product's own fields.
 *
 * Categories and skin types are one column each, holding as many values as the
 * product wears, separated by commas — see `MULTI_SEPARATOR`. They used to be a
 * numbered column per slot, which made the sheet wider every time a product
 * picked up another one.
 */
const PRODUCT_COLUMNS = [
  "Title",
  "Cover img 1",
  "Img 2",
  "Img 3",
  "Img 4",
  "Price",
  "Discount",
  "SKU",
  "Stock",
  "Size",
  "Key Ingredients",
  "Description",
  "New in",
  "Limited",
  "Brand",
  "Categories",
  "Collection",
  "Skin Types",
];

const PRODUCT_HEADERS = PRODUCT_COLUMNS;

/** What separates the values inside a Categories or Skin Types cell. */
const MULTI_SEPARATOR = ", ";

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
      Stock: "12",
      Size: "125ml — 14.9% vol.",
      "Key Ingredients": "Mineral Clay, Shea Butter",
      Description: "Smooth, rich, essential.",
      "New in": "no",
      Limited: "yes",
      Brand: "Clinique",
      Categories: "Cleanser, Toner",
      Collection: "Offers",
      "Skin Types": "Dry, Sensitive",
    },
    notes: [
      "Title is the only required column.",
      "Brand, Categories, Collection and Skin Types are dropdowns in the Excel file — pick from what the shop already has. An unknown name is reported, never created.",
      "Categories and Skin Types take more than one: pick one from the dropdown, then type the rest after it separated by commas — “Cleanser, Toner”. Excel only offers one value at a time, so that column accepts typing as well as picking.",
      "New in and Limited are yes/no dropdowns. A file written by hand may use true/false or 1/0 instead.",
      "Stock is the number of units on hand. Leave the cell empty not to track that product — it never shows as sold out and never blocks a checkout.",
      "The slug and the SKU are issued automatically — there is nothing to fill in.",
      "Images are uploaded on the product's own page; an import never touches them.",
      "A row whose title already exists updates that product instead of adding a second.",
    ],
  },
};

// ── export ───────────────────────────────────────────────────────────────────

const ORDER = BY_ADDED;

/** The product sheet: its rows and the header row they fill. */
async function productSheet(): Promise<{ headers: string[]; rows: Row[] }> {
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    orderBy: ORDER,
    include: {
      brand: { select: { title: true } },
      categories: { select: { category: { select: { title: true } } } },
      collection: { select: { title: true } },
      skinTypes: { select: { skinType: { select: { title: true } } } },
    },
  });

  const rows = products.map((product) => {
    const row: Row = {
      Title: product.title,
      "Cover img 1": product.coverImage ?? "",
      "Img 2": product.image2 ?? "",
      "Img 3": product.image3 ?? "",
      "Img 4": product.image4 ?? "",
      Price: String(Number(product.price)),
      Discount: String(product.discount),
      SKU: product.sku ?? "",
      // Blank means untracked, which is what an empty cell imports back as.
      Stock: product.stock === null ? "" : String(product.stock),
      Size: product.size ?? "",
      "Key Ingredients": product.keyIngredients ?? "",
      Description: product.description ?? "",
      "New in": product.isNewIn ? "yes" : "no",
      Limited: product.isLimited ? "yes" : "no",
      Brand: product.brand?.title ?? "",
      Categories: product.categories
        .map((link) => link.category.title)
        .join(MULTI_SEPARATOR),
      Collection: product.collection?.title ?? "",
      "Skin Types": product.skinTypes
        .map((link) => link.skinType.title)
        .join(MULTI_SEPARATOR),
    };

    return row;
  });

  return { headers: PRODUCT_HEADERS, rows };
}

/**
 * The dropdown lists, straight from the live tables. A blank list simply means
 * no validation on that column — an empty range is not a legal one in Excel.
 */
async function productDropdowns(): Promise<XlsxDropdown[]> {
  const live = { archivedAt: null };
  const select = { title: true };
  const titles = (rows: Array<{ title: string }>) => rows.map((row) => row.title);

  const [brands, categories, collections, skinTypes] = await Promise.all([
    prisma.brand.findMany({ where: live, orderBy: BY_NAME, select }),
    prisma.category.findMany({ where: live, orderBy: ORDER, select }),
    prisma.collection.findMany({ where: live, orderBy: ORDER, select }),
    prisma.skinType.findMany({ where: live, orderBy: ORDER, select }),
  ]);

  // `multi` marks the two columns that hold a comma-separated list: their
  // dropdown suggests rather than enforces, so a second value can be typed in
  // after the first is picked. See `XlsxDropdown`.
  return [
    { label: "Brands", headers: ["Brand"], values: titles(brands) },
    {
      label: "Categories",
      headers: ["Categories"],
      values: titles(categories),
      multi: true,
    },
    { label: "Collections", headers: ["Collection"], values: titles(collections) },
    {
      label: "Skin types",
      headers: ["Skin Types"],
      values: titles(skinTypes),
      multi: true,
    },
    // The badge flags are a fixed pair rather than a table, so this list is the
    // same in every export.
    {
      label: "Yes or no",
      headers: ["New in", "Limited"],
      values: ["yes", "no"],
      error: "Pick yes or no.",
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
    dropdowns: await productDropdowns(),
  });
}

/** The same workbook with one example row and no catalogue in it. */
export async function sampleProductsXlsx(): Promise<Uint8Array> {
  const headers = TRANSFERS.products.importHeaders;
  return toXlsx({
    sheetName: "Products",
    headers,
    rows: [TRANSFERS.products.sample],
    dropdowns: await productDropdowns(),
  });
}

export async function exportRows(key: TransferKey): Promise<Row[]> {
  const order = ORDER;
  const live = { archivedAt: null };

  if (key === "products") return (await productSheet()).rows;

  const select = { title: true };
  const rows =
    key === "brands"
      ? await prisma.brand.findMany({ where: live, orderBy: BY_NAME, select })
      : key === "categories"
        ? await prisma.category.findMany({ where: live, orderBy: order, select })
        : key === "collections"
          ? await prisma.collection.findMany({ where: live, orderBy: order, select })
          : await prisma.skinType.findMany({ where: live, orderBy: order, select });

  return rows.map((row) => ({ Title: row.title }));
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

/** Far more numbered columns than any catalogue ever had, so the scan always ends. */
const MAX_NUMBERED_COLUMNS = 20;

/**
 * Splits a multi-value cell. Commas are what the sheet writes; semicolons are
 * read too, because an older export used them.
 */
function names(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Categories arrive in one comma-separated cell. "Category" is read as well —
 * that was the column's name while a product could only have one, and a file
 * saved back then still imports.
 */
function categoryNames(row: Row): string[] {
  return [...names(cell(row, "Categories")), ...names(cell(row, "Category"))];
}

/**
 * The same for skin types, which additionally spent a while as a numbered
 * column per slot. All three shapes are read.
 */
function skinTypeNames(row: Row): string[] {
  const found = names(cell(row, "Skin Types"));

  for (let column = 1; column <= MAX_NUMBERED_COLUMNS; column += 1) {
    found.push(...names(cell(row, `Skin Type ${column}`)));
  }

  return found;
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

    // An empty cell means "do not track this one", not "zero" — the difference
    // between a product that is always available and one that is sold out.
    const stockRaw = cell(row, "Stock");
    const stock = stockRaw === "" ? null : Number.parseInt(stockRaw, 10);
    if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      result.skipped += 1;
      note(`${at(index)}: stock “${stockRaw}” must be a whole number of 0 or more, or left empty.`);
      continue;
    }

    /** Resolves a list column, dropping the names the shop does not stock. */
    const resolveAll = (
      wanted: string[],
      lookup: Map<string, string>,
      label: string
    ): string[] => [
      ...new Set(
        wanted
          .map((name) => resolve(lookup, name, label, index))
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const categoryIds = resolveAll(categoryNames(row), categoryIndex, "category");
    const skinTypeIds = resolveAll(skinTypeNames(row), skinTypeIndex, "skin type");

    // No image fields: they are uploaded in the dashboard, and leaving them out
    // of the update keeps pictures a spreadsheet has no way to carry.
    const data = {
      title,
      price: price.toFixed(2),
      discount,
      stock,
      size: cell(row, "Size") || null,
      keyIngredients: cell(row, "Key Ingredients") || null,
      description: cell(row, "Description") || null,
      isNewIn: boolean(cell(row, "New in")),
      isLimited: boolean(cell(row, "Limited")),
      brandId: resolve(brandIndex, cell(row, "Brand"), "brand", index),
      collectionId: resolve(collectionIndex, cell(row, "Collection"), "collection", index),
    };

    try {
      const existing = await prisma.product.findFirst({
        where: { title: { equals: title, mode: "insensitive" }, archivedAt: null },
        select: { id: true, sku: true },
      });

      if (existing) {
        // Both lists are replaced wholesale rather than diffed: the row in the
        // file is the whole truth about what that product is filed under.
        await prisma.$transaction([
          prisma.product.update({
            where: { id: existing.id },
            // A product from before SKUs were issued picks one up here; one that
            // already has a code keeps it, because paperwork quotes it.
            data: existing.sku ? data : { ...data, sku: issueSku() },
          }),
          prisma.productCategory.deleteMany({ where: { productId: existing.id } }),
          prisma.productCategory.createMany({
            data: categoryIds.map((categoryId) => ({ productId: existing.id, categoryId })),
            skipDuplicates: true,
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
            categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
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
