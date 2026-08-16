/**
 * Seeds the Glaze database with the catalogue as it stood in Canopy.
 *
 * `seed-data.json` is a verbatim capture of the old CMS's public API, so a
 * reset always lands on the same content the storefront shipped against.
 * Everything is upserted by slug — re-running is safe and non-destructive.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

// ── shape of the captured Canopy payload ─────────────────────────────────────

type Ref = string | { Slug?: string } | null | undefined;

interface RawNamed {
  Slug: string;
  Title: string;
}
interface RawUtilityPage extends RawNamed {
  Content?: string;
}
interface RawProduct {
  Slug: string;
  Title: string;
  "Cover img 1"?: string;
  "Img 2"?: string;
  "Img 3"?: string;
  "Img 4"?: string;
  Price?: string;
  Discount?: string;
  "New in"?: boolean;
  Limited?: boolean;
  SKU?: string;
  Size?: string;
  "Key Ingredients"?: string;
  Description?: string;
  Brand?: Ref;
  Category?: Ref;
  Collections?: Ref;
  "Skin Type"?: Ref | Ref[];
}

interface SeedData {
  brands: RawNamed[];
  categories: RawNamed[];
  collections: RawNamed[];
  products: RawProduct[];
  "skin-types": RawNamed[];
  "utility-pages": RawUtilityPage[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Relations came back either expanded or as a bare slug — normalise both. */
function refSlug(value: Ref): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  return value.Slug || null;
}

function refSlugs(value: Ref | Ref[]): string[] {
  if (Array.isArray(value)) return value.map(refSlug).filter((s): s is string => !!s);
  const one = refSlug(value);
  return one ? [one] : [];
}

function decimalFrom(value: string | undefined): string {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function intFrom(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

// ── seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const data: SeedData = JSON.parse(
    await readFile(join(here, "seed-data.json"), "utf8")
  );

  // 1. Taxonomies first — products point at them.
  for (const [i, b] of data.brands.entries()) {
    await prisma.brand.upsert({
      where: { slug: b.Slug },
      create: { slug: b.Slug, title: b.Title, sortIndex: i },
      update: { title: b.Title },
    });
  }

  for (const [i, c] of data.categories.entries()) {
    await prisma.category.upsert({
      where: { slug: c.Slug },
      create: { slug: c.Slug, title: c.Title, sortIndex: i },
      update: { title: c.Title },
    });
  }

  for (const [i, c] of data.collections.entries()) {
    await prisma.collection.upsert({
      where: { slug: c.Slug },
      create: { slug: c.Slug, title: c.Title, sortIndex: i },
      update: { title: c.Title },
    });
  }

  for (const [i, s] of data["skin-types"].entries()) {
    await prisma.skinType.upsert({
      where: { slug: s.Slug },
      create: { slug: s.Slug, title: s.Title, sortIndex: i },
      update: { title: s.Title },
    });
  }

  for (const [i, u] of data["utility-pages"].entries()) {
    await prisma.utilityPage.upsert({
      where: { slug: u.Slug },
      create: { slug: u.Slug, title: u.Title, content: u.Content ?? "", sortIndex: i },
      update: { title: u.Title, content: u.Content ?? "" },
    });
  }

  // 2. Products, resolving relations by slug.
  const brandIds = await idsBySlug(prisma.brand.findMany({ select: { id: true, slug: true } }));
  const categoryIds = await idsBySlug(
    prisma.category.findMany({ select: { id: true, slug: true } })
  );
  const collectionIds = await idsBySlug(
    prisma.collection.findMany({ select: { id: true, slug: true } })
  );
  const skinTypeIds = await idsBySlug(
    prisma.skinType.findMany({ select: { id: true, slug: true } })
  );

  for (const [i, p] of data.products.entries()) {
    const fields = {
      title: p.Title,
      coverImage: p["Cover img 1"] ?? null,
      image2: p["Img 2"] ?? null,
      image3: p["Img 3"] ?? null,
      image4: p["Img 4"] ?? null,
      price: decimalFrom(p.Price),
      discount: intFrom(p.Discount),
      sku: p.SKU ?? null,
      size: p.Size ?? null,
      keyIngredients: p["Key Ingredients"] ?? null,
      description: p.Description ?? null,
      isNewIn: p["New in"] === true,
      isLimited: p.Limited === true,
      brandId: lookup(brandIds, refSlug(p.Brand)),
      categoryId: lookup(categoryIds, refSlug(p.Category)),
      collectionId: lookup(collectionIds, refSlug(p.Collections)),
    };

    // Slugs are normally derived from the title at creation; here they come
    // from the capture so the storefront's existing product URLs keep working.
    const product = await prisma.product.upsert({
      where: { slug: p.Slug },
      create: { slug: p.Slug, sortIndex: i, ...fields },
      update: fields,
      select: { id: true },
    });

    // Canopy had no Skin Type field on products, so this is empty on the first
    // import — the relation exists because the storefront filter already reads
    // it. Replace-in-full keeps a re-run idempotent.
    const wanted = refSlugs(p["Skin Type"])
      .map((slug) => skinTypeIds.get(slug))
      .filter((id): id is string => !!id);

    await prisma.productSkinType.deleteMany({ where: { productId: product.id } });
    if (wanted.length > 0) {
      await prisma.productSkinType.createMany({
        data: wanted.map((skinTypeId) => ({ productId: product.id, skinTypeId })),
        skipDuplicates: true,
      });
    }
  }

  // 3. Ticker lines.
  //
  // Not part of the capture — Canopy had no such collection, so these are the
  // four strings the storefront used to hard-code. Written only when the table
  // is empty: unlike the catalogue above this is copy the client rewrites, and
  // a re-seed must not bring back a line they deliberately removed.
  if ((await prisma.tickerItem.count()) === 0) {
    await prisma.tickerItem.createMany({
      data: [
        { slug: "new-in", title: "NEW IN" },
        { slug: "50", title: "50%" },
        { slug: "discount", title: "Discount" },
        { slug: "star", title: "*" },
      ].map((item, i) => ({ ...item, sortIndex: i })),
    });
  }

  // 4. Owner account.
  const email = (process.env.SEED_OWNER_EMAIL || "owner@glaze.store").toLowerCase();
  const name = process.env.SEED_OWNER_NAME || "Glaze Owner";
  const existingOwner = await prisma.user.findUnique({ where: { email } });

  if (!existingOwner) {
    const password = process.env.SEED_OWNER_PASSWORD || randomBytes(9).toString("base64url");
    await prisma.user.create({
      data: {
        email,
        name,
        role: "OWNER",
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`\n  Owner account created`);
    console.log(`    email:    ${email}`);
    console.log(`    password: ${password}`);
    if (!process.env.SEED_OWNER_PASSWORD) {
      console.log(`    (generated — copy it now, it is not stored in plain text)`);
    }
  } else {
    console.log(`\n  Owner account already exists: ${email}`);
  }

  // 5. Storefront API key.
  const liveKeys = await prisma.apiKey.count({ where: { revokedAt: null } });
  if (liveKeys === 0) {
    const raw = process.env.SEED_API_KEY || `glz_${randomBytes(32).toString("hex")}`;
    await prisma.apiKey.create({
      data: {
        name: "Storefront",
        keyHash: createHash("sha256").update(raw).digest("hex"),
        keyPrefix: raw.slice(0, 12),
      },
    });
    console.log(`\n  Storefront API key created`);
    console.log(`    ${raw}`);
    console.log(`    Set this as NEXT_PUBLIC_CMS_API_KEY in the storefront.`);
  } else {
    console.log(`\n  ${liveKeys} API key(s) already active — none created.`);
  }

  const counts = {
    brands: await prisma.brand.count(),
    categories: await prisma.category.count(),
    collections: await prisma.collection.count(),
    skinTypes: await prisma.skinType.count(),
    products: await prisma.product.count(),
    tickerItems: await prisma.tickerItem.count(),
    utilityPages: await prisma.utilityPage.count(),
  };
  console.log(`\n  Seeded:`, counts, "\n");
}

async function idsBySlug(
  query: Promise<Array<{ id: string; slug: string }>>
): Promise<Map<string, string>> {
  const rows = await query;
  return new Map(rows.map((r) => [r.slug, r.id]));
}

function lookup(map: Map<string, string>, slug: string | null): string | null {
  return slug ? map.get(slug) ?? null : null;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
