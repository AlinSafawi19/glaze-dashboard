"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireOwner, requireUserForAction } from "@/lib/dal";
import { nextSku } from "@/lib/sku";
import { uniqueSlug } from "@/lib/slug";
import type { FormState } from "@/lib/actions/resources";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

function checked(formData: FormData, key: string): boolean {
  return formData.get(key) !== null;
}

function relation(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" ? null : value;
}

/** Everything except the slug and the SKU, both issued once at creation. */
type ProductFields = Omit<Prisma.ProductUncheckedCreateInput, "slug" | "sku">;

type Parsed =
  | { ok: true; data: ProductFields; categoryIds: string[]; skinTypeIds: string[] }
  | { ok: false; error: string };

/** A multi-select posts one entry per pick, or none at all when it is empty. */
function relations(formData: FormData, key: string): string[] {
  return [...new Set(formData.getAll(key).map(String).filter(Boolean))];
}

function parse(formData: FormData): Parsed {
  const title = text(formData, "title");
  if (!title) return { ok: false, error: "Title is required." };

  const price = Number.parseFloat(text(formData, "price") || "0");
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Price must be a number of 0 or more." };
  }

  const discount = Number.parseInt(text(formData, "discount") || "0", 10);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    return { ok: false, error: "Discount is a percentage between 0 and 100." };
  }

  // Empty is a choice, not a blank left unfilled: it means this product is not
  // counted. Only a value that is actually there has to be whole units.
  const stockRaw = text(formData, "stock");
  const stock = stockRaw === "" ? null : Number.parseInt(stockRaw, 10);
  if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
    return {
      ok: false,
      error: "Stock must be a whole number of 0 or more, or empty to stop tracking it.",
    };
  }

  for (const key of ["coverImage", "image2", "image3", "image4"]) {
    const url = optional(formData, key);
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, error: "Image URLs must start with http:// or https://." };
    }
  }

  return {
    ok: true,
    data: {
      title,
      coverImage: optional(formData, "coverImage"),
      image2: optional(formData, "image2"),
      image3: optional(formData, "image3"),
      image4: optional(formData, "image4"),
      price: price.toFixed(2),
      discount,
      stock,
      size: optional(formData, "size"),
      keyIngredients: optional(formData, "keyIngredients"),
      description: optional(formData, "description"),
      bestFor: optional(formData, "bestFor"),
      benefits: optional(formData, "benefits"),
      isNewIn: checked(formData, "isNewIn"),
      isLimited: checked(formData, "isLimited"),
      brandId: relation(formData, "brandId"),
      collectionId: relation(formData, "collectionId"),
    },
    categoryIds: relations(formData, "categoryIds"),
    skinTypeIds: relations(formData, "skinTypeIds"),
  };
}

function refresh() {
  revalidatePath("/products");
  revalidatePath("/dashboard");
}

export async function createProduct(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  await requireUserForAction();
  const parsed = parse(formData);
  if (!parsed.ok) return { error: parsed.error };

  const last = await prisma.product.findFirst({
    orderBy: { sortIndex: "desc" },
    select: { sortIndex: true },
  });

  let id: string;
  try {
    const created = await prisma.product.create({
      data: {
        ...parsed.data,
        slug: await uniqueSlug("product", parsed.data.title),
        sku: await nextSku(),
        sortIndex: (last?.sortIndex ?? -1) + 1,
        categories: {
          create: parsed.categoryIds.map((categoryId) => ({ categoryId })),
        },
        skinTypes: {
          create: parsed.skinTypeIds.map((skinTypeId) => ({ skinTypeId })),
        },
      },
      select: { id: true },
    });
    id = created.id;
  } catch (error) {
    console.error("[product create]", error);
    return { error: "Could not save. Please try again." };
  }

  refresh();
  redirect("/products");
}

export async function updateProduct(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  await requireUserForAction();
  const parsed = parse(formData);
  if (!parsed.ok) return { error: parsed.error };

  // The list hides the edit link on an archived product and the editor refuses
  // to open one, but neither is a control — a stale tab or a hand-made request
  // would still reach this action, so the rule is enforced here too.
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { archivedAt: true, sku: true },
  });
  if (!existing) return { error: "That product no longer exists." };
  if (existing.archivedAt) {
    return { error: "This product is archived. Restore it before making changes." };
  }

  try {
    // The slug is not in `data`: it is fixed at creation so renaming a product
    // never breaks its storefront link or the slugs saved in shoppers' carts.
    // Categories and skin types are replaced wholesale — simpler and cheaper
    // than diffing a handful of rows, and it keeps the join tables honest.
    // A product created before SKUs were issued picks one up on its next save;
    // one that already has a code keeps it, because paperwork quotes it.
    const data = existing.sku ? parsed.data : { ...parsed.data, sku: await nextSku() };

    await prisma.$transaction([
      prisma.product.update({ where: { id }, data }),
      prisma.productCategory.deleteMany({ where: { productId: id } }),
      prisma.productCategory.createMany({
        data: parsed.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
        skipDuplicates: true,
      }),
      prisma.productSkinType.deleteMany({ where: { productId: id } }),
      prisma.productSkinType.createMany({
        data: parsed.skinTypeIds.map((skinTypeId) => ({ productId: id, skinTypeId })),
        skipDuplicates: true,
      }),
    ]);
  } catch (error) {
    console.error("[product update]", error);
    return { error: "Could not save. Please try again." };
  }

  refresh();
  redirect("/products");
}

/**
 * Nudges one product's stock by `delta`, from the list.
 *
 * Restocking is the most repeated thing anyone does here, and going through the
 * editor for "three more arrived" is three clicks and a page load too many.
 *
 * The arithmetic is done by the database rather than read-then-written here, so
 * two people counting the same shelf cannot overwrite each other. The floor is
 * applied in the `where`: a decrement that would go negative matches no row and
 * leaves the count alone.
 */
export async function adjustStock(id: string, delta: number): Promise<void> {
  await requireUserForAction();

  if (!Number.isInteger(delta) || delta === 0) throw new Error("Not a stock change.");

  const product = await prisma.product.findUnique({
    where: { id },
    select: { stock: true, archivedAt: true },
  });
  if (!product) throw new Error("That product no longer exists.");
  if (product.archivedAt) throw new Error("Restore this product before changing its stock.");
  if (product.stock === null) {
    throw new Error("This product is not stock-tracked. Set a number in the editor first.");
  }

  await prisma.product.updateMany({
    where: { id, stock: { gte: delta < 0 ? -delta : 0 } },
    data: { stock: { increment: delta } },
  });

  refresh();
}

export async function archiveProduct(id: string): Promise<void> {
  await requireUserForAction();

  const product = await prisma.product.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!product) throw new Error("That product no longer exists.");
  if (product.archivedAt) return; // already archived

  await prisma.product.update({ where: { id }, data: { archivedAt: new Date() } });
  refresh();
}

export async function restoreProduct(id: string): Promise<void> {
  await requireUserForAction();

  const product = await prisma.product.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!product) throw new Error("That product no longer exists.");
  if (!product.archivedAt) return; // already live

  await prisma.product.update({ where: { id }, data: { archivedAt: null } });
  refresh();
}

export async function deleteProduct(id: string): Promise<void> {
  await requireOwner();

  const product = await prisma.product.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!product?.archivedAt) throw new Error("Archive it first.");

  await prisma.product.delete({ where: { id } });
  refresh();
}

/** Duplicating a product is how the client adds a variant without retyping. */
export async function duplicateProduct(id: string): Promise<void> {
  await requireUserForAction();

  const source = await prisma.product.findUniqueOrThrow({
    where: { id },
    include: {
      categories: { select: { categoryId: true } },
      skinTypes: { select: { skinTypeId: true } },
    },
  });

  // Duplicate is only offered on live rows; restore the original first.
  if (source.archivedAt) throw new Error("Restore this product before duplicating it.");

  const last = await prisma.product.findFirst({
    orderBy: { sortIndex: "desc" },
    select: { sortIndex: true },
  });

  const title = `${source.title} (copy)`;

  const {
    id: _id,
    slug: _slug,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    categories,
    skinTypes,
    ...fields
  } = source;

  const copy = await prisma.product.create({
    data: {
      ...fields,
      title,
      slug: await uniqueSlug("product", title),
      archivedAt: null,
      sortIndex: (last?.sortIndex ?? -1) + 1,
      categories: { create: categories.map((c) => ({ categoryId: c.categoryId })) },
      skinTypes: { create: skinTypes.map((s) => ({ skinTypeId: s.skinTypeId })) },
    },
    select: { id: true },
  });

  refresh();
  redirect(`/products/${copy.id}`);
}
