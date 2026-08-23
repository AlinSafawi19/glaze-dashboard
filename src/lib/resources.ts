/**
 * The six list-shaped collections — brands, categories, collections, skin
 * types, ticker lines and utility pages — are all "a slug, a title and a few
 * extras". Rather than six near-identical CRUD screens, each one is described
 * here once and rendered by the shared list/form components.
 *
 * Products and orders are not in here: they have enough structure of their own
 * to earn bespoke screens.
 */

export type FieldType = "text" | "url" | "textarea" | "richtext";

export interface ResourceField {
  /** Prisma column name. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}

export interface ResourceColumn {
  name: string;
  label: string;
  type?: "text" | "image" | "count" | "html";
}

export type ResourceKey =
  | "brands"
  | "categories"
  | "collections"
  | "skin-types"
  | "ticker"
  | "utility-pages";

export type ModelKey =
  | "brand"
  | "category"
  | "collection"
  | "skinType"
  | "tickerItem"
  | "utilityPage";

export interface ResourceConfig {
  key: ResourceKey;
  model: ModelKey;
  /** Singular, for buttons and headings. */
  label: string;
  plural: string;
  description: string;
  fields: ResourceField[];
  columns: ResourceColumn[];
  /** Set when the list should show how many products point at each row. */
  productCount?: boolean;
  /** Which storefront-facing API collection this feeds. */
  apiSlug: string;
}

export const RESOURCES: Record<ResourceKey, ResourceConfig> = {
  brands: {
    key: "brands",
    model: "brand",
    label: "Brand",
    plural: "Brands",
    description: "The A–Z index above the shop, and the brand filter.",
    apiSlug: "brands",
    productCount: true,
    fields: [
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        maxLength: 160,
        placeholder: "Clinique",
      },
    ],
    columns: [{ name: "title", label: "Title" }],
  },

  categories: {
    key: "categories",
    model: "category",
    label: "Category",
    plural: "Categories",
    description: "The product type filter on the shop page.",
    apiSlug: "categories",
    productCount: true,
    fields: [
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        maxLength: 160,
        placeholder: "Cleanser",
      },
    ],
    columns: [{ name: "title", label: "Title" }],
  },

  collections: {
    key: "collections",
    model: "collection",
    label: "Collection",
    plural: "Collections",
    description:
      "Merchandising groups. The one slugged “offers” drives the Offers section on the home page.",
    apiSlug: "collections",
    productCount: true,
    fields: [
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        maxLength: 160,
        placeholder: "SkinCare",
      },
    ],
    columns: [{ name: "title", label: "Title" }],
  },

  "skin-types": {
    key: "skin-types",
    model: "skinType",
    label: "Skin type",
    plural: "Skin types",
    description: "The skin type filter. Tag products from the product editor.",
    apiSlug: "skin-types",
    productCount: true,
    fields: [
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        maxLength: 160,
        placeholder: "Sensitive",
      },
    ],
    columns: [{ name: "title", label: "Title" }],
  },

  ticker: {
    key: "ticker",
    model: "tickerItem",
    label: "Ticker line",
    plural: "Ticker",
    description:
      "The scrolling banner under the home page hero. Lines run left to right in the order below, on repeat.",
    apiSlug: "ticker",
    fields: [
      {
        name: "title",
        label: "Text",
        type: "text",
        required: true,
        maxLength: 60,
        placeholder: "50% off",
        hint: "Keep it to a few words. Add a line of just “*” to separate the others.",
      },
    ],
    columns: [{ name: "title", label: "Text" }],
  },

  "utility-pages": {
    key: "utility-pages",
    model: "utilityPage",
    label: "Page",
    plural: "Utility pages",
    description: "Terms, returns and other long-form copy the storefront renders.",
    apiSlug: "utility-pages",
    fields: [
      {
        name: "title",
        label: "Title",
        type: "text",
        required: true,
        maxLength: 200,
        placeholder: "Terms of Use",
      },
      {
        name: "content",
        label: "Content",
        type: "richtext",
        placeholder: "<h5>Section title</h5>\n<p>Paragraph copy…</p>",
        hint: "HTML. Headings, paragraphs, lists and links are kept; scripts and styles are stripped on save.",
      },
    ],
    columns: [
      { name: "title", label: "Title" },
      { name: "content", label: "Content", type: "html" },
    ],
  },
};

export const RESOURCE_LIST = Object.values(RESOURCES);

/**
 * List ordering.
 *
 * Most lists read in the order rows were added, which is what `sortIndex`
 * records. Brands are the exception: the storefront presents them as an A–Z
 * index, so they sort by name and a newly added one lands in its right place
 * the moment it is saved rather than at the bottom.
 */
export const BY_ADDED = [{ sortIndex: "asc" as const }, { createdAt: "asc" as const }];
export const BY_NAME = [{ title: "asc" as const }];

export function orderFor(model: ModelKey) {
  return model === "brand" ? BY_NAME : BY_ADDED;
}

/** `"L'Oreal Paris"` → `"l-oreal-paris"`. Matches the slugs already in use. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    // NFKD splits "é" into "e" + a combining accent; drop the accent so the
    // slug reads "e" rather than picking up a separator.
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
