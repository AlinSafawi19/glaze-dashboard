import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { ActionButton } from "@/components/confirm-button";
import { SearchInput } from "@/components/search-input";
import { TransferButtons } from "@/components/transfer-buttons";
import {
  Badge,
  EmptyState,
  FilterBar,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import {
  archiveProduct,
  deleteProduct,
  duplicateProduct,
  restoreProduct,
} from "@/lib/actions/products";
import { bestSellerIds, unitsSoldByProduct } from "@/lib/best-sellers";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { TRANSFERS } from "@/lib/transfer";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; q?: string }>;
}) {
  const { archived, q } = await searchParams;
  const showArchived = archived === "1";
  const search = (q ?? "").trim();

  const [products, user, bestSellers, unitsSold] = await Promise.all([
    prisma.product.findMany({
      where: {
        ...(showArchived ? {} : { archivedAt: null }),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
                { sku: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
      include: {
        brand: { select: { title: true } },
        category: { select: { title: true } },
        collection: { select: { title: true } },
        skinTypes: {
          select: { skinType: { select: { id: true, title: true } } },
          orderBy: { skinType: { sortIndex: "asc" } },
        },
      },
    }),
    getCurrentUser(),
    bestSellerIds(),
    unitsSoldByProduct(),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Everything on the shop page and in the cart."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <TransferButtons
              info={{
                key: TRANSFERS.products.key,
                label: TRANSFERS.products.label,
                headers: TRANSFERS.products.importHeaders,
                notes: TRANSFERS.products.notes,
              }}
            />
            <LinkButton href="/products/new" variant="primary">
              New product
            </LinkButton>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <FilterBar className="mb-0 min-w-0 gap-4">
          <Link
            href="/products"
            className={showArchived ? "text-brown hover:text-black" : "text-black underline underline-offset-4"}
          >
            Live
          </Link>
          <Link
            href="/products?archived=1"
            className={showArchived ? "text-black underline underline-offset-4" : "text-brown hover:text-black"}
          >
            Including archived
          </Link>
        </FilterBar>

        <SearchInput placeholder="Search title, slug or SKU" />
      </div>

      {products.length === 0 ? (
        <EmptyState
          title={search ? "Nothing matched that search" : "No products yet"}
          description={
            search
              ? "Try a shorter search, or clear it to see everything."
              : "Add the first product and it appears on the storefront right away."
          }
          action={
            search ? (
              <LinkButton href="/products">Clear search</LinkButton>
            ) : (
              <LinkButton href="/products/new">Add a product</LinkButton>
            )
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th />
              <Th>Product</Th>
              <Th>Brand</Th>
              <Th>Category</Th>
              <Th>Collection</Th>
              <Th>Skin types</Th>
              <Th>Price</Th>
              <Th>Sold</Th>
              <Th>Badges</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const price = Number(product.price);
              const final =
                product.discount > 0
                  ? Math.round(price * (1 - product.discount / 100))
                  : price;

              return (
                <tr key={product.id}>
                  <Td className="w-14">
                    {product.coverImage ? (
                      <Image
                        src={product.coverImage}
                        alt=""
                        width={40}
                        height={48}
                        unoptimized
                        className="h-12 w-10 rounded-none border border-line object-cover"
                      />
                    ) : (
                      <div className="h-12 w-10 rounded-none border border-dashed border-line" />
                    )}
                  </Td>

                  <Td label="Product">
                    {/* Archived products are not editable, so the title only
                        links into the editor while the product is live. */}
                    {product.archivedAt ? (
                      <span>{product.title}</span>
                    ) : (
                      <Link
                        href={`/products/${product.id}`}
                        className="transition-colors hover:text-plum"
                      >
                        {product.title}
                      </Link>
                    )}
                    <p className="font-inter text-[12px] font-light text-brown">
                      /{product.slug}
                      {product.sku && ` · SKU ${product.sku}`}
                    </p>
                    {product.archivedAt && (
                      <span className="mt-1 inline-block">
                        <Badge tone="warn">Archived</Badge>
                      </span>
                    )}
                  </Td>

                  <Td label="Brand" className="text-brown">
                    {product.brand?.title ?? "—"}
                  </Td>
                  <Td label="Category" className="text-brown">
                    {product.category?.title ?? "—"}
                  </Td>
                  <Td label="Collection" className="text-brown">
                    {product.collection?.title ?? "—"}
                  </Td>

                  <Td label="Skin types" className="text-brown">
                    {product.skinTypes.length === 0
                      ? "—"
                      : product.skinTypes.map((link) => link.skinType.title).join(", ")}
                  </Td>

                  <Td label="Price">
                    <span>${final}</span>
                    {product.discount > 0 && (
                      <span className="ml-1.5 font-inter text-[12px] text-brown line-through">
                        ${price}
                      </span>
                    )}
                  </Td>

                  <Td label="Sold" className="text-brown tabular-nums">
                    {unitsSold.get(product.id) ?? 0}
                  </Td>

                  <Td label="Badges">
                    <div className="flex flex-wrap gap-1">
                      {bestSellers.has(product.id) && (
                        <Badge tone="success">Best seller</Badge>
                      )}
                      {product.isLimited && <Badge tone="warn">Limited</Badge>}
                      {product.isNewIn && <Badge>New in</Badge>}
                      {product.discount > 0 && (
                        <Badge tone="danger">−{product.discount}%</Badge>
                      )}
                    </div>
                  </Td>

                  <Td>
                    {/* One row of plain actions — no borders, no fills, and no
                        dimming on archived rows. */}
                    <div className="flex items-center justify-end gap-1">
                      {product.archivedAt ? (
                        <>
                          <ActionButton
                            action={restoreProduct.bind(null, product.id)}
                            label="Restore"
                            variant="row"
                            confirmTitle="Restore this product?"
                            confirm="It goes back on the storefront and becomes editable again."
                            confirmLabel="Restore"
                          />
                          {user?.role === "OWNER" && (
                            <ActionButton
                              action={deleteProduct.bind(null, product.id)}
                              label="Delete"
                              variant="rowDanger"
                              confirmTitle="Delete this product for good?"
                              confirm="This cannot be undone. Past orders keep their own copy of the name and price, so order history is unaffected."
                              confirmLabel="Delete permanently"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <LinkButton href={`/products/${product.id}`} variant="row">
                            Edit
                          </LinkButton>
                          <ActionButton
                            action={duplicateProduct.bind(null, product.id)}
                            label="Duplicate"
                            variant="row"
                          />
                          <ActionButton
                            action={archiveProduct.bind(null, product.id)}
                            label="Archive"
                            variant="row"
                            confirmTitle="Archive this product?"
                            confirm="It comes off the storefront and can no longer be edited, but you can restore it at any time."
                            confirmLabel="Archive"
                          />
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
