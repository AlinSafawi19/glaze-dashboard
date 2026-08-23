import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";

import { ActionButton } from "@/components/confirm-button";
import { Pagination } from "@/components/pagination";
import { SearchInput } from "@/components/search-input";
import { StatusFilter } from "@/components/status-filter";
import { StatusControl } from "@/components/status-control";
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
import { archiveOrder, restoreOrder } from "@/lib/actions/orders";
import { ORDER_STATUSES } from "@/lib/order-status";
import { normaliseOrderReference } from "@/lib/order-reference";
import { readWindow } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { ClickableCopyableText } from "@/components/text";

export const metadata: Metadata = { title: "Orders" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    archived?: string;
    q?: string;
    page?: string;
    show?: string;
  }>;
}) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const search = (params.q ?? "").trim();
  const window = readWindow(params);
  const filter = ORDER_STATUSES.includes(params.status as OrderStatus)
    ? (params.status as OrderStatus)
    : null;

  // Search and filters both go into `where`, so they run over every order in
  // the table and the page is cut from the result — not the other way round.
  const where = {
    ...(showArchived ? {} : { archivedAt: null }),
    ...(filter ? { status: filter } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { city: { contains: search, mode: "insensitive" as const } },
            // Typed however it was read off an email: lower case, spaces, the
            // dashes or the prefix left out.
            { reference: { contains: normaliseOrderReference(search) ?? search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: window.skip,
      take: window.take,
      include: { items: { select: { id: true, quantity: true } } },
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ["status"],
      where: { archivedAt: null },
      _count: true,
    }),
  ]);

  const statusCounts = Object.fromEntries(
    counts.map((row) => [row.status, row._count])
  ) as Partial<Record<OrderStatus, number>>;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Cash on delivery. Call the customer to confirm, then move the status along."
      />

      <FilterBar>
        <Link
          href={showArchived ? "/orders" : "/orders?archived=1"}
          className={showArchived ? "text-black underline underline-offset-4" : "text-brown hover:text-black"}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
      </FilterBar>

      {/* Search and status sit on one line: they are the two ways into this
          list, and splitting them over two rows read as two unrelated tools. */}
      <div className="mb-4 flex flex-col gap-3 tablet:flex-row tablet:items-center">
        <div className="tablet:flex-1">
          <SearchInput placeholder="Search name, phone, email, city or reference" />
        </div>
        <StatusFilter value={filter} counts={statusCounts} />
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders here"
          description="Orders placed on the storefront land in this list the moment checkout completes."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Where</Th>
              <Th>Items</Th>
              <Th>Total</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const units = order.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <tr key={order.id}>
                  <Td label="Order">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium hover:text-accent"
                    >
                      {order.reference}
                    </Link>
                    <p className="text-xs text-muted">{DATE.format(order.createdAt)}</p>
                  </Td>
                  <Td label="Customer">
                    <p className="font-medium">{order.name}</p>
                    <p className="text-xs text-muted">
                      <ClickableCopyableText value={order.phone} label="phone number" />
                    </p>
                  </Td>
                  <Td label="Where" className="text-muted">
                    {order.city}
                  </Td>
                  <Td label="Items" className="text-muted">
                    {units} {units === 1 ? "item" : "items"}
                  </Td>
                  <Td label="Total" className="font-medium">
                    ${Number(order.total)}
                  </Td>
                  <Td label="Status">
                    {order.archivedAt ? (
                      <Badge tone="warn">Archived</Badge>
                    ) : (
                      <StatusControl id={order.id} status={order.status} />
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <LinkButton href={`/orders/${order.id}`} variant="row">
                        Open
                      </LinkButton>
                      {order.archivedAt ? (
                        <ActionButton
                          action={restoreOrder.bind(null, order.id)}
                          label="Restore"
                          variant="row"
                          confirmTitle="Restore this order?"
                          confirm="It returns to the inbox and its status becomes editable again."
                          confirmLabel="Restore"
                        />
                      ) : (
                        <ActionButton
                          action={archiveOrder.bind(null, order.id)}
                          label="Archive"
                          variant="row"
                          confirmTitle="Archive this order?"
                          confirm="It stays on record but leaves the inbox, and its status can no longer be changed."
                          confirmLabel="Archive"
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {orders.length > 0 && (
        <Pagination
          total={total}
          page={window.page}
          shown={orders.length}
          cumulative={window.cumulative}
        />
      )}
    </>
  );
}
