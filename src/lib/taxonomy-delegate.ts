import "server-only";

import { prisma } from "@/lib/prisma";
import type { ModelKey } from "@/lib/resources";

/**
 * Brand, Category, Collection and SkinType are structurally identical for CRUD
 * purposes, but Prisma gives each its own delegate type and a union of them is
 * not callable — TypeScript cannot reconcile four different `where` shapes.
 *
 * This narrows them to the operations the shared screens and the CSV importer
 * actually use. The cast is the one place the config-driven approach gives up
 * static field checking; validation and the schema's own constraints cover what
 * it loses.
 */
export interface SimpleDelegate {
  findFirst(args: {
    orderBy: { sortIndex: "desc" };
    select: { sortIndex: true };
  }): Promise<{ sortIndex: number } | null>;
  /** Title lookup — how the importer finds the row a spreadsheet means. */
  findFirst(args: {
    where: {
      title: { equals: string; mode: "insensitive" };
      archivedAt: null;
    };
    select: { id: true };
  }): Promise<{ id: string } | null>;
  findUnique(args: {
    where: { id: string } | { slug: string };
    select: { id?: true; archivedAt?: true };
  }): Promise<{ id: string; archivedAt?: Date | null } | null>;
  create(args: {
    data: Record<string, unknown>;
    select?: { id: true };
  }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

export function taxonomyDelegate(model: ModelKey): SimpleDelegate {
  const delegates = {
    brand: prisma.brand,
    category: prisma.category,
    collection: prisma.collection,
    skinType: prisma.skinType,
    tickerItem: prisma.tickerItem,
    utilityPage: prisma.utilityPage,
  };
  return delegates[model] as unknown as SimpleDelegate;
}
