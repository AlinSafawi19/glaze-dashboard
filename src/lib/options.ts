import "server-only";

import { prisma } from "@/lib/prisma";
import { BY_NAME } from "@/lib/resources";

/**
 * Option lists that come out of the database, for every searchable select in
 * the dashboard.
 *
 * These are looked up per keystroke rather than shipped to the browser in
 * full: a shop with two thousand products has a brand list no page should be
 * sending down just in case someone opens the dropdown.
 */

export type OptionSource =
  | "brand"
  | "category"
  | "collection"
  | "skinType"
  | "orderCity"
  | "customerCity";

export const OPTION_SOURCES: OptionSource[] = [
  "brand",
  "category",
  "collection",
  "skinType",
  "orderCity",
  "customerCity",
];

export interface Option {
  value: string;
  label: string;
}

/** Enough to fill the menu; the reader narrows it by typing rather than scrolling. */
const LIMIT = 20;

export function isOptionSource(value: string): value is OptionSource {
  return (OPTION_SOURCES as string[]).includes(value);
}

export async function loadOptions(source: OptionSource, query: string): Promise<Option[]> {
  const q = query.trim();
  const contains = q ? { contains: q, mode: "insensitive" as const } : undefined;

  switch (source) {
    case "brand":
    case "category":
    case "collection":
    case "skinType": {
      // Archived rows are not offered: they are not choices any more, though a
      // row already pointing at one keeps its value.
      //
      // Spelled out per model rather than looked up in a map, because a union
      // of Prisma delegates is not callable — the same reason
      // `@/lib/taxonomy-delegate` exists.
      const args = {
        where: { archivedAt: null, ...(contains ? { title: contains } : {}) },
        // Brands are an A–Z index on the storefront, so they are offered in
        // that order here too; the rest keep the order they were added in.
        orderBy:
          source === "brand"
            ? BY_NAME
            : [{ sortIndex: "asc" as const }, { title: "asc" as const }],
        select: { id: true, title: true },
        take: LIMIT,
      };

      const rows =
        source === "brand"
          ? await prisma.brand.findMany(args)
          : source === "category"
            ? await prisma.category.findMany(args)
            : source === "collection"
              ? await prisma.collection.findMany(args)
              : await prisma.skinType.findMany(args);

      return rows.map((row) => ({ value: row.id, label: row.title }));
    }

    // Cities are free text on the row rather than a table of their own, so the
    // options are whatever has actually been typed into orders so far.
    case "orderCity": {
      const rows = await prisma.order.findMany({
        where: contains ? { city: contains } : {},
        distinct: ["city"],
        orderBy: { city: "asc" },
        select: { city: true },
        take: LIMIT,
      });
      return rows.map((row) => ({ value: row.city, label: row.city }));
    }

    case "customerCity": {
      const rows = await prisma.customer.findMany({
        where: { city: { not: null, ...(contains ?? {}) } },
        distinct: ["city"],
        orderBy: { city: "asc" },
        select: { city: true },
        take: LIMIT,
      });
      return rows
        .filter((row): row is { city: string } => Boolean(row.city))
        .map((row) => ({ value: row.city, label: row.city }));
    }
  }
}
