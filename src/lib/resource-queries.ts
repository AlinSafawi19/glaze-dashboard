import "server-only";

import { prisma } from "@/lib/prisma";
import type { ResourceConfig } from "@/lib/resources";
import type { ResourceValues } from "@/components/resource-form";

/**
 * Loads one row and flattens it to the string map the shared form expects.
 *
 * Returns null for an archived row as well as a missing one: an archived item
 * is not editable, so its editor must not open. The matching server action
 * enforces the same rule, since a page-level check only stops navigation.
 */
export async function loadResource(
  config: ResourceConfig,
  id: string
): Promise<(ResourceValues & { title: string }) | null> {
  const row = await findRow(config, id);
  if (!row || (row as { archivedAt: Date | null }).archivedAt) return null;

  const values: ResourceValues = {};
  for (const field of config.fields) {
    const value = (row as Record<string, unknown>)[field.name];
    values[field.name] = value === null || value === undefined ? null : String(value);
  }

  return { ...values, title: String((row as { title: string }).title) };
}

function findRow(config: ResourceConfig, id: string) {
  switch (config.model) {
    case "brand":
      return prisma.brand.findUnique({ where: { id } });
    case "category":
      return prisma.category.findUnique({ where: { id } });
    case "collection":
      return prisma.collection.findUnique({ where: { id } });
    case "skinType":
      return prisma.skinType.findUnique({ where: { id } });
    case "tickerItem":
      return prisma.tickerItem.findUnique({ where: { id } });
    case "utilityPage":
      return prisma.utilityPage.findUnique({ where: { id } });
  }
}
