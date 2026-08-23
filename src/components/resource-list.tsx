import Image from "next/image";
import Link from "next/link";

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
import { ActionButton } from "@/components/confirm-button";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { TransferButtons } from "@/components/transfer-buttons";
import { archiveResource, deleteResource, restoreResource } from "@/lib/actions/resources";
import { getCurrentUser } from "@/lib/dal";
import { readWindow, type ListWindow } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { orderFor, type ResourceConfig, type ResourceKey } from "@/lib/resources";
import { TRANSFERS, type TransferKey } from "@/lib/transfer";

interface Row {
  id: string;
  archivedAt: Date | null;
  _count?: { products: number };
  [key: string]: unknown;
}

/**
 * Search runs against the table, not the page: `where` goes into the query and
 * the window is taken from what matches. Slug as well as title, because the
 * slug is what a storefront URL shows and so what gets pasted in here.
 */
function buildWhere(includeArchived: boolean, search: string) {
  return {
    ...(includeArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

async function loadRows(
  config: ResourceConfig,
  where: ReturnType<typeof buildWhere>,
  window: ListWindow
): Promise<Row[]> {
  const args = {
    where,
    orderBy: orderFor(config.model),
    skip: window.skip,
    take: window.take,
    ...(config.productCount
      ? { include: { _count: { select: { products: true } } } }
      : {}),
  };

  switch (config.model) {
    case "brand":
      return prisma.brand.findMany(args);
    case "category":
      return prisma.category.findMany(args);
    case "collection":
      return prisma.collection.findMany(args);
    case "skinType":
      return prisma.skinType.findMany(args);
    // Neither of these has products pointing at it, so they take the plain
    // where/orderBy rather than `args` and its `_count` include.
    case "tickerItem":
      return prisma.tickerItem.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: window.skip,
        take: window.take,
      });
    case "utilityPage":
      return prisma.utilityPage.findMany({
        where: args.where,
        orderBy: args.orderBy,
        skip: window.skip,
        take: window.take,
      });
  }
}

function countRows(
  config: ResourceConfig,
  where: ReturnType<typeof buildWhere>
): Promise<number> {
  switch (config.model) {
    case "brand":
      return prisma.brand.count({ where });
    case "category":
      return prisma.category.count({ where });
    case "collection":
      return prisma.collection.count({ where });
    case "skinType":
      return prisma.skinType.count({ where });
    case "tickerItem":
      return prisma.tickerItem.count({ where });
    case "utilityPage":
      return prisma.utilityPage.count({ where });
  }
}

/** Strips tags so an HTML column can be previewed as a line of plain text. */
function textPreview(html: string, limit = 90): string {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export async function ResourceListPage({
  config,
  searchParams,
}: {
  config: ResourceConfig;
  searchParams: Promise<{ archived?: string; q?: string; page?: string; show?: string }>;
}) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const search = (params.q ?? "").trim();
  const window = readWindow(params);
  const where = buildWhere(showArchived, search);

  const [rows, total, user] = await Promise.all([
    loadRows(config, where, window),
    countRows(config, where),
    getCurrentUser(),
  ]);

  const key: ResourceKey = config.key;

  // Utility pages hold long-form HTML, which does not belong in a spreadsheet.
  const spec = TRANSFERS[key as TransferKey];
  const transfer = spec
    ? { key: spec.key, label: spec.label, headers: spec.importHeaders, notes: spec.notes }
    : null;

  return (
    <>
      <PageHeader
        title={config.plural}
        subtitle={config.description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {transfer && <TransferButtons info={transfer} />}
            <LinkButton href={`/${key}/new`} variant="primary">
              New {config.label.toLowerCase()}
            </LinkButton>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <FilterBar className="mb-0 min-w-0 gap-4">
          <Link
            href={`/${key}`}
            className={
              showArchived ? "text-brown hover:text-black" : "text-black underline underline-offset-4"
            }
          >
            Live
          </Link>
          <Link
            href={`/${key}?archived=1`}
            className={
              showArchived ? "text-black underline underline-offset-4" : "text-brown hover:text-black"
            }
          >
            Including archived
          </Link>
        </FilterBar>

        <SearchInput placeholder={`Search ${config.plural.toLowerCase()}`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={search ? "Nothing matched that search" : `No ${config.plural.toLowerCase()} yet`}
          description={
            search ? "Try a shorter search, or clear it to see everything." : config.description
          }
          action={
            search ? (
              <LinkButton href={`/${key}`}>Clear search</LinkButton>
            ) : (
              <LinkButton href={`/${key}/new`}>Add the first one</LinkButton>
            )
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              {config.columns.map((column) => (
                <Th key={column.name}>{column.label}</Th>
              ))}
              {config.productCount && <Th>Products</Th>}
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {config.columns.map((column) => {
                  const value = row[column.name];

                  if (column.type === "image") {
                    return (
                      <Td key={column.name} className="w-16">
                        {typeof value === "string" && value ? (
                          <Image
                            src={value}
                            alt=""
                            width={36}
                            height={36}
                            unoptimized
                            className="h-9 w-9 rounded-none border border-line object-cover"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-none border border-dashed border-line" />
                        )}
                      </Td>
                    );
                  }

                  if (column.type === "html") {
                    return (
                      <Td key={column.name} label={column.label} className="max-w-sm text-muted">
                        {typeof value === "string" ? textPreview(value) : "—"}
                      </Td>
                    );
                  }

                  const isName = column.name === "title";
                  return (
                    <Td
                      key={column.name}
                      label={column.label}
                      className={isName ? undefined : "text-brown"}
                    >
                      {isName ? (
                        <span className="flex items-center gap-2">
                          {/* Archived rows are not editable, so the title is
                              not a link into the editor either. */}
                          {row.archivedAt ? (
                            <span>{String(value ?? "—")}</span>
                          ) : (
                            <Link
                              href={`/${key}/${row.id}`}
                              className="transition-colors hover:text-plum"
                            >
                              {String(value ?? "—")}
                            </Link>
                          )}
                          {row.archivedAt && <Badge tone="warn">Archived</Badge>}
                        </span>
                      ) : (
                        String(value ?? "—")
                      )}
                    </Td>
                  );
                })}

                {config.productCount && (
                  <Td label="Products" className="text-brown">
                    {row._count?.products ?? 0}
                  </Td>
                )}

                <Td>
                  {/* Edit, archive, restore and delete all read as one row of
                      plain actions — no borders, no fills, no dimming. */}
                  <div className="flex items-center justify-end gap-1">
                    {row.archivedAt ? (
                      <>
                        <ActionButton
                          action={restoreResource.bind(null, key, row.id)}
                          label="Restore"
                          variant="row"
                          confirmTitle={`Restore this ${config.label.toLowerCase()}?`}
                          confirm="It goes back on the storefront and becomes editable again."
                          confirmLabel="Restore"
                        />
                        {user?.role === "OWNER" && (
                          <ActionButton
                            action={deleteResource.bind(null, key, row.id)}
                            label="Delete"
                            variant="rowDanger"
                            confirmTitle={`Delete this ${config.label.toLowerCase()} for good?`}
                            confirm="This cannot be undone. Any product pointing at it loses the link."
                            confirmLabel="Delete permanently"
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <LinkButton href={`/${key}/${row.id}`} variant="row">
                          Edit
                        </LinkButton>
                        <ActionButton
                          action={archiveResource.bind(null, key, row.id)}
                          label="Archive"
                          variant="row"
                          confirmTitle={`Archive this ${config.label.toLowerCase()}?`}
                          confirm="It stops showing on the storefront and can no longer be edited, but you can restore it at any time."
                          confirmLabel="Archive"
                        />
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {rows.length > 0 && (
        <Pagination
          total={total}
          page={window.page}
          shown={rows.length}
          cumulative={window.cumulative}
        />
      )}
    </>
  );
}
