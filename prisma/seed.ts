/**
 * Seeds the Glaze database with the taxonomies and pages as they stood in Canopy.
 *
 * `seed-data.json` is a capture of the old CMS's public API, trimmed to the
 * content a seed recreates, so a reset always lands on the same taxonomies
 * and pages the storefront shipped against. Everything is upserted by slug —
 * re-running is safe and non-destructive.
 *
 * Products are deliberately not seeded: they are the client's own catalogue,
 * entered through the dashboard.
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

interface RawNamed {
  Slug: string;
  Title: string;
}
interface RawUtilityPage extends RawNamed {
  Content?: string;
}

interface SeedData {
  brands: RawNamed[];
  categories: RawNamed[];
  collections: RawNamed[];
  "skin-types": RawNamed[];
  ticker: RawNamed[];
  "utility-pages": RawUtilityPage[];
}

/** Captured utility pages that should not be recreated by a seed. */
const SKIPPED_UTILITY_PAGES = new Set(["return-policy"]);

// ── seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const data: SeedData = JSON.parse(
    await readFile(join(here, "seed-data.json"), "utf8")
  );

  // 1. Taxonomies and pages.
  // The storefront lists brands A–Z rather than by `sortIndex`, so the order
  // they are seeded in only decides the tie-break between identical names.
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

  for (const [i, t] of data.ticker.entries()) {
    await prisma.tickerItem.upsert({
      where: { slug: t.Slug },
      create: { slug: t.Slug, title: t.Title, sortIndex: i },
      update: { title: t.Title },
    });
  }

  // Pages the shop no longer publishes are skipped here rather than seeded.
  const utilityPages = data["utility-pages"].filter(
    (u) => !SKIPPED_UTILITY_PAGES.has(u.Slug)
  );

  for (const [i, u] of utilityPages.entries()) {
    await prisma.utilityPage.upsert({
      where: { slug: u.Slug },
      create: { slug: u.Slug, title: u.Title, content: u.Content ?? "", sortIndex: i },
      update: { title: u.Title, content: u.Content ?? "" },
    });
  }

  // 2. Owner account.
  const email = (process.env.SEED_OWNER_EMAIL || "hello@glazekorea.com").toLowerCase();
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
        // Sign-in requires a proven address, and there is nobody to email a
        // code to the shop's first account — whoever runs the seed owns it.
        emailVerifiedAt: new Date(),
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

  // 3. Storefront API key.
  const liveKeys = await prisma.apiKey.count({ where: { revokedAt: null } });
  if (liveKeys === 0) {
    const raw = `glz_${randomBytes(32).toString("hex")}`;
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
    ticker: await prisma.tickerItem.count(),
    utilityPages: await prisma.utilityPage.count(),
  };
  console.log(`\n  Seeded:`, counts, "\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
