import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/confirm-button";
import { Filters, type FilterSpec } from "@/components/filters";
import { Pagination } from "@/components/pagination";
import { ProductImages } from "@/components/product-images";
import { SearchInput } from "@/components/search-input";
import { StockControl } from "@/components/stock-control";
import { TransferButtons } from "@/components/transfer-buttons";
import {
  Badge,
  EmptyState,
  FilterBar,
  Card,
  LinkButton,
  PageHeader,
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
import { readWindow } from "@/lib/pagination";
import { LOW_STOCK_AT } from "@/lib/stock";
import { TRANSFERS } from "@/lib/transfer";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    archived?: string;
    q?: string;
    brand?: string;
    category?: string;
    collection?: string;
    skinType?: string;
    stock?: string;
    page?: string;
    show?: string;
  }>;
}) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const search = (params.q ?? "").trim();
  const window = readWindow(params);

  // Stock is a shelf question rather than a catalogue one, so it filters from
  // its own row of links rather than the dropdowns below. "Untracked" is a
  // state in its own right, not an absence — hence the explicit null tests.
  const stockWhere =
    params.stock === "out"
      ? { stock: { lte: 0 } }
      : params.stock === "low"
        ? { stock: { gt: 0, lte: LOW_STOCK_AT } }
        : params.stock === "tracked"
          ? { stock: { not: null } }
          : params.stock === "untracked"
            ? { stock: null }
            : {};

  // Every one of these lands in the query's `where`, so a filter narrows the
  // whole catalogue and the count below the table is the real total — not a
  // count of what survived on the current page.
  const where = {
    ...(showArchived ? {} : { archivedAt: null }),
    ...(params.brand ? { brandId: params.brand } : {}),
    ...(params.category ? { categories: { some: { categoryId: params.category } } } : {}),
    ...(params.collection ? { collectionId: params.collection } : {}),
    ...(params.skinType
      ? { skinTypes: { some: { skinTypeId: params.skinType } } }
      : {}),
    ...stockWhere,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total, user, bestSellers, unitsSold, chosen] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
      skip: window.skip,
      take: window.take,
      include: {
        brand: { select: { title: true } },
        categories: {
          select: { category: { select: { id: true, title: true } } },
          orderBy: { category: { sortIndex: "asc" } },
        },
        collection: { select: { title: true } },
        skinTypes: {
          select: { skinType: { select: { id: true, title: true } } },
          orderBy: { skinType: { sortIndex: "asc" } },
        },
      },
    }),
    prisma.product.count({ where }),
    getCurrentUser(),
    bestSellerIds(),
    unitsSoldByProduct(),
    // The filter selects hold ids; these are the labels to show for them.
    Promise.all([
      params.brand
        ? prisma.brand.findUnique({ where: { id: params.brand }, select: { title: true } })
        : null,
      params.category
        ? prisma.category.findUnique({ where: { id: params.category }, select: { title: true } })
        : null,
      params.collection
        ? prisma.collection.findUnique({
            where: { id: params.collection },
            select: { title: true },
          })
        : null,
      params.skinType
        ? prisma.skinType.findUnique({
            where: { id: params.skinType },
            select: { title: true },
          })
        : null,
    ]),
  ]);

  const [brandChoice, categoryChoice, collectionChoice, skinTypeChoice] = chosen;

  const filters: FilterSpec[] = [
    {
      param: "brand",
      label: "Brand",
      source: "brand",
      value: params.brand ?? null,
      valueLabel: brandChoice?.title ?? null,
    },
    {
      param: "category",
      label: "Category",
      source: "category",
      value: params.category ?? null,
      valueLabel: categoryChoice?.title ?? null,
    },
    {
      param: "collection",
      label: "Collection",
      source: "collection",
      value: params.collection ?? null,
      valueLabel: collectionChoice?.title ?? null,
    },
    {
      param: "skinType",
      label: "Skin type",
      source: "skinType",
      value: params.skinType ?? null,
      valueLabel: skinTypeChoice?.title ?? null,
    },
  ];

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

      {/* Stock, as a row of links rather than another dropdown: "what is out"
          is a question the shop asks every morning, and it should be one click
          from the top of the page. */}
      <FilterBar className="mb-4 min-w-0 gap-4">
        {(
          [
            [undefined, "All stock"],
            ["out", "Out of stock"],
            ["low", `Low (${LOW_STOCK_AT} or fewer)`],
            ["tracked", "Tracked"],
            ["untracked", "Not tracked"],
          ] as Array<[string | undefined, string]>
        ).map(([value, label]) => {
          const active = (params.stock ?? undefined) === value;
          const query = new URLSearchParams();
          if (showArchived) query.set("archived", "1");
          if (search) query.set("q", search);
          if (value) query.set("stock", value);
          const href = query.toString() ? `/products?${query}` : "/products";

          return (
            <Link
              key={label}
              href={href}
              className={
                active ? "text-black underline underline-offset-4" : "text-brown hover:text-black"
              }
            >
              {label}
            </Link>
          );
        })}
      </FilterBar>

      <Filters filters={filters} />

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
        <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {products.map((product) => {
            const price = Number(product.price);
            const final =
              product.discount > 0
                ? Math.round(price * (1 - product.discount / 100))
                : price;
            const sold = unitsSold.get(product.id) ?? 0;
            const facets: Array<[string, string]> = [
              ["Brand", product.brand?.title ?? "—"],
              [
                "Categories",
                product.categories.length === 0
                  ? "—"
                  : product.categories.map((link) => link.category.title).join(", "),
              ],
              ["Collection", product.collection?.title ?? "—"],
              [
                "Skin types",
                product.skinTypes.length === 0
                  ? "—"
                  : product.skinTypes.map((link) => link.skinType.title).join(", "),
              ],
            ];

            return (
              <Card key={product.id} className="flex flex-col overflow-hidden">
                {/* Artwork first: this is a catalogue, and the picture is how
                    anyone actually recognises the product they came for. All
                    four slots are steppable, so a wrong or missing extra image
                    shows up here rather than only in the editor. */}
                <div className="relative">
                  <ProductImages
                    images={[
                      product.coverImage,
                      product.image2,
                      product.image3,
                      product.image4,
                    ].filter((src): src is string => Boolean(src && src.trim()))}
                    title={product.title}
                    className="aspect-[4/3] w-full"
                  />

                  {(bestSellers.has(product.id) ||
                    product.isLimited ||
                    product.isNewIn ||
                    product.discount > 0 ||
                    (product.stock !== null && product.stock <= 0) ||
                    product.archivedAt) && (
                    <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                      {product.archivedAt && <Badge tone="warn">Archived</Badge>}
                      {product.stock !== null && product.stock <= 0 && (
                        <Badge tone="danger">Out of stock</Badge>
                      )}
                      {bestSellers.has(product.id) && <Badge tone="success">Best seller</Badge>}
                      {product.isLimited && <Badge tone="warn">Limited</Badge>}
                      {product.isNewIn && <Badge>New in</Badge>}
                      {product.discount > 0 && (
                        <Badge tone="danger">−{product.discount}%</Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-4 p-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      {/* Archived products are not editable, so the title only
                          links into the editor while the product is live. */}
                      <h2 className="text-[18px] leading-[1.25] text-black">
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
                      </h2>
                      <p className="shrink-0 text-right">
                        <span className="text-[18px] text-black tabular-nums">${final}</span>
                        {product.discount > 0 && (
                          <span className="ml-1.5 font-inter text-[12px] text-brown line-through tabular-nums">
                            ${price}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="mt-1 font-inter text-[12px] font-light text-brown">
                      /{product.slug}
                      {product.sku && ` · SKU ${product.sku}`}
                    </p>
                  </div>

                  {/* A label/value list rather than a row of columns — with one
                      product per card there is nothing to align across. */}
                  <dl className="flex flex-col gap-1.5">
                    {facets.map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt className="w-[86px] shrink-0 label-sm text-brown">{label}</dt>
                        <dd className="font-inter text-[13px] text-black">{value}</dd>
                      </div>
                    ))}
                    <div className="flex gap-3">
                      <dt className="w-[86px] shrink-0 label-sm text-brown">Sold</dt>
                      <dd className="font-inter text-[13px] text-black tabular-nums">{sold}</dd>
                    </div>
                    <div className="flex items-center gap-3">
                      <dt className="w-[86px] shrink-0 label-sm text-brown">Stock</dt>
                      <dd>
                        <StockControl id={product.id} stock={product.stock} />
                      </dd>
                    </div>
                  </dl>

                  {/* Pushed to the bottom so the buttons line up across a row of
                      cards whose text runs to different lengths. */}
                  <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-dashed border-beige pt-3">
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
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {products.length > 0 && (
        <Pagination
          total={total}
          page={window.page}
          shown={products.length}
          cumulative={window.cumulative}
        />
      )}
    </>
  );
}
