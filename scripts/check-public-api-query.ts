/**
 * Checks for the /api/v1 query language.
 *
 * Run with `npm run check:api`. Deliberately a plain script rather than a test
 * framework: this project has no test runner, and the parsing rules are worth
 * pinning down without adding one.
 */

import { parseCollectionQuery, validateForCollection } from "../src/lib/public-api-query";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.log(`FAIL  ${label}\n      expected ${e}\n      got      ${a}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

function q(search: string) {
  return parseCollectionQuery(new URLSearchParams(search));
}

// ── defaults ────────────────────────────────────────────────────────────────
const bare = q("");
check("defaults: page", bare.query?.page, 1);
check("defaults: limit", bare.query?.limit, 20);
check("defaults: no filters", bare.query?.brands, []);
check("defaults: sort unset", bare.query?.sort, null);

// ── paging ──────────────────────────────────────────────────────────────────
check("limit over 100 refused", q("limit=500").error?.message,
  "Invalid `limit`: must be 100 or fewer");
check("limit=100 allowed", q("limit=100").query?.limit, 100);
check("page=0 refused", Boolean(q("page=0").error), true);
check("empty param ignored", q("limit=").query?.limit, 20);
check("non-numeric limit refused", Boolean(q("limit=abc").error), true);

// ── lists ───────────────────────────────────────────────────────────────────
check("comma list", q("brand=a,b,c").query?.brands, ["a", "b", "c"]);
check("repeated param", q("brand=a&brand=b").query?.brands, ["a", "b"]);
check("mixed forms merge", q("brand=a,b&brand=c").query?.brands, ["a", "b", "c"]);
check("duplicates collapse", q("brand=a,a,b").query?.brands, ["a", "b"]);
check("blanks dropped", q("brand=a,,b,").query?.brands, ["a", "b"]);
check("whitespace trimmed", q("brand=%20a%20,b").query?.brands, ["a", "b"]);
check("oversized list refused",
  Boolean(q("brand=" + Array.from({ length: 51 }, (_, i) => `b${i}`).join(",")).error), true);
check("50 values allowed",
  q("brand=" + Array.from({ length: 50 }, (_, i) => `b${i}`).join(",")).query?.brands.length, 50);

// ── startsWith ──────────────────────────────────────────────────────────────
check("letter uppercased", q("startsWith=k").query?.startsWith, "K");
check("hash allowed", q("startsWith=%23").query?.startsWith, "#");
check("two letters refused", Boolean(q("startsWith=ab").error), true);
check("digit refused", Boolean(q("startsWith=1").error), true);

// ── sort ────────────────────────────────────────────────────────────────────
check("known sort", q("sort=-price").query?.sort, "-price");
check("unknown sort refused", Boolean(q("sort=sideways").error), true);

// ── per-collection validation ───────────────────────────────────────────────
check("brand filter ok on products",
  validateForCollection("products", q("brand=x").query!), null);
check("brand filter refused on categories",
  validateForCollection("categories", q("brand=x").query!)?.message,
  "`brand` is only available on `products`.");
check("skinType refused on brands",
  validateForCollection("brands", q("skinType=x").query!)?.message,
  "`skinType` is only available on `products`.");
check("price sort refused on brands",
  validateForCollection("brands", q("sort=price").query!)?.message,
  "`sort=price` is only available on `products`.");
check("name sort fine on brands",
  validateForCollection("brands", q("sort=name").query!), null);
check("search fine anywhere",
  validateForCollection("brands", q("search=cosrx").query!), null);

// ── search / slug / exclude ─────────────────────────────────────────────────
check("search trimmed", q("search=%20snail%20").query?.search, "snail");
check("blank search is null", q("search=%20%20").query?.search, null);
check("slug list", q("slug=a&slug=b").query?.slugs, ["a", "b"]);
check("exclude list", q("exclude=x").query?.exclude, ["x"]);
check("facets list", q("facets=initials").query?.facets, ["initials"]);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
