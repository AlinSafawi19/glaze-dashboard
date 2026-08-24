import "server-only";

import { z } from "zod";

/**
 * The query language of /api/v1's collection endpoint.
 *
 * The storefront used to read whole collections and narrow them in the browser,
 * which meant every shopper downloaded the catalogue to look at twelve products
 * — and a catalogue past the page limit was silently cut off. Filtering,
 * searching and sorting all live here now, so a request returns the page the
 * shopper is actually looking at and nothing else.
 *
 * Everything is optional and additive: a request with no parameters behaves
 * exactly as it did before this module existed.
 */

export const DEFAULT_LIMIT = 20;

/**
 * Ceiling on `limit`. A larger value is refused rather than quietly clamped —
 * a caller that asked for 500 and received 100 without being told would have no
 * way to know its list was cut short.
 */
export const MAX_LIMIT = 100;

/**
 * Values accepted in one comma-separated filter. Generous for a real shop's
 * filter panel, small enough that no request can build a pathological `IN`.
 */
const MAX_LIST = 50;

export const SORTS = ["added", "name", "price", "-price", "newest", "oldest"] as const;
export type Sort = (typeof SORTS)[number];

/** Sorts that read a column only products have. */
const PRODUCT_ONLY_SORTS: readonly Sort[] = ["price", "-price"];

/** Filters that traverse a relation only products have. */
const PRODUCT_ONLY_FILTERS = ["category", "brand", "collection", "skinType"] as const;

/** Grouping key for titles that do not begin with a letter. */
export const NON_ALPHA = "#";

export interface CollectionQuery {
  page:       number;
  limit:      number;
  /** Exact slugs. The cheapest way to resolve a saved cart or one product page. */
  slugs:      string[];
  /** Slugs to leave out — a "related products" strip skipping the one on screen. */
  exclude:    string[];
  search:     string | null;
  /** A single letter, or {@link NON_ALPHA}. Drives the brand A–Z index. */
  startsWith: string | null;
  categories: string[];
  brands:     string[];
  collections: string[];
  skinTypes:  string[];
  sort:       Sort | null;
  /** Extra aggregates to compute alongside the page. Currently `initials`. */
  facets:     string[];
}

const schema = z.object({
  page: z.coerce
    .number({ error: "must be a whole number" })
    .int("must be a whole number")
    .min(1, "starts at 1")
    .default(1),
  limit: z.coerce
    .number({ error: "must be a whole number" })
    .int("must be a whole number")
    .min(1, "must be at least 1")
    .max(MAX_LIMIT, `must be ${MAX_LIMIT} or fewer`)
    .default(DEFAULT_LIMIT),
  search: z
    .string()
    .trim()
    .min(1)
    .max(120, "must be 120 characters or fewer")
    .nullable()
    .default(null),
  startsWith: z
    .string()
    .trim()
    .refine((v) => v === NON_ALPHA || /^[A-Za-z]$/.test(v), {
      message: `must be a single letter or "${NON_ALPHA}"`,
    })
    .transform((v) => (v === NON_ALPHA ? NON_ALPHA : v.toUpperCase()))
    .nullable()
    .default(null),
  sort:       z.enum(SORTS).nullable().default(null),
});

/** A parameter that is present but empty is the same as not sending it. */
function scalar(sp: URLSearchParams, name: string): string | undefined {
  const raw = sp.get(name);
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * A repeatable, comma-separated filter. `?brand=a,b` and `?brand=a&brand=b` are
 * the same request — the storefront builds one and hand-written calls tend to
 * build the other.
 */
function list(sp: URLSearchParams, name: string): string[] {
  const values = sp
    .getAll(name)
    .flatMap((raw) => raw.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export interface QueryError {
  /** Ready to send as the body of a 400. */
  message: string;
}

export type ParseResult =
  | { query: CollectionQuery; error?: undefined }
  | { query?: undefined; error: QueryError };

/** Reads and validates a request's query string. */
export function parseCollectionQuery(sp: URLSearchParams): ParseResult {
  const parsed = schema.safeParse({
    page:       scalar(sp, "page"),
    limit:      scalar(sp, "limit"),
    search:     scalar(sp, "search"),
    startsWith: scalar(sp, "startsWith"),
    sort:       scalar(sp, "sort"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: { message: `Invalid \`${issue.path.join(".")}\`: ${issue.message}` } };
  }

  const lists = {
    slugs:       list(sp, "slug"),
    exclude:     list(sp, "exclude"),
    categories:  list(sp, "category"),
    brands:      list(sp, "brand"),
    collections: list(sp, "collection"),
    skinTypes:   list(sp, "skinType"),
    facets:      list(sp, "facets"),
  };

  // Truncating would quietly return the wrong rows, so an oversized filter is
  // refused rather than trimmed.
  for (const [name, values] of Object.entries(lists)) {
    if (values.length > MAX_LIST) {
      return { error: { message: `Too many values for \`${name}\` — ${MAX_LIST} at most.` } };
    }
  }

  return { query: { ...parsed.data, ...lists } };
}

/**
 * Rejects a query that asks a collection for something it does not have, rather
 * than ignoring the parameter and returning a page the caller did not ask for.
 */
export function validateForCollection(
  collection: string,
  query: CollectionQuery,
): QueryError | null {
  if (collection === "products") return null;

  const used = PRODUCT_ONLY_FILTERS.find((name) => {
    switch (name) {
      case "category":   return query.categories.length > 0;
      case "brand":      return query.brands.length > 0;
      case "collection": return query.collections.length > 0;
      case "skinType":   return query.skinTypes.length > 0;
    }
  });
  if (used) {
    return { message: `\`${used}\` is only available on \`products\`.` };
  }

  if (query.sort && PRODUCT_ONLY_SORTS.includes(query.sort)) {
    return { message: `\`sort=${query.sort}\` is only available on \`products\`.` };
  }

  return null;
}
