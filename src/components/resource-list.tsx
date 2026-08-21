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
import { TransferButtons } from "@/components/transfer-buttons";
import { archiveResource, deleteResource, restoreResource } from "@/lib/actions/resources";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import type { ResourceConfig, ResourceKey } from "@/lib/resources";
import { TRANSFERS, type TransferKey } from "@/lib/transfer";

interface Row {
  id: string;
  archivedAt: Date | null;
  _count?: { products: number };
  [key: string]: unknown;
}

async function loadRows(config: ResourceConfig, includeArchived: boolean): Promise<Row[]> {
  const args = {
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: [{ sortIndex: "asc" as const }, { createdAt: "asc" as const }],
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
      });
    case "utilityPage":
      return prisma.utilityPage.findMany({
        where: args.where,
        orderBy: args.orderBy,
      });
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
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const [rows, user] = await Promise.all([
    loadRows(config, showArchived),
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

      <FilterBar className="gap-4">
        <Link
          href={`/${key}`}
          className={showArchived ? "text-brown hover:text-black" : "text-black underline underline-offset-4"}
        >
          Live
        </Link>
        <Link
          href={`/${key}?archived=1`}
          className={showArchived ? "text-black underline underline-offset-4" : "text-brown hover:text-black"}
        >
          Including archived
        </Link>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={`No ${config.plural.toLowerCase()} yet`}
          description={config.description}
          action={<LinkButton href={`/${key}/new`}>Add the first one</LinkButton>}
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
    </>
  );
}
