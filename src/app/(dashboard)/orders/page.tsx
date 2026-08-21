import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus } from "@prisma/client";

import { ActionButton } from "@/components/confirm-button";
import { StatusSelect } from "@/components/status-select";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { archiveOrder, restoreOrder } from "@/lib/actions/orders";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";
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
  searchParams: Promise<{ status?: string; archived?: string }>;
}) {
  const { status, archived } = await searchParams;
  const showArchived = archived === "1";
  const filter = ORDER_STATUSES.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : null;

  const orders = await prisma.order.findMany({
    where: {
      ...(showArchived ? {} : { archivedAt: null }),
      ...(filter ? { status: filter } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { id: true, quantity: true } } },
  });

  const counts = await prisma.order.groupBy({
    by: ["status"],
    where: { archivedAt: null },
    _count: true,
  });
  const countFor = (s: OrderStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Cash on delivery. Call the customer to confirm, then move the status along."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 label-sm">
        <Link
          href="/orders"
          className={filter ? "text-brown hover:text-black" : "text-black underline underline-offset-4"}
        >
          All
        </Link>
        {ORDER_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/orders?status=${value}`}
            className={
              filter === value
                ? "text-black underline underline-offset-4"
                : "text-brown hover:text-black"
            }
          >
            {STATUS_LABEL[value]}
            {countFor(value) > 0 && (
              <span className="ml-1 text-brown">({countFor(value)})</span>
            )}
          </Link>
        ))}
        <span className="text-beige">|</span>
        <Link
          href={showArchived ? "/orders" : "/orders?archived=1"}
          className={showArchived ? "text-black underline underline-offset-4" : "text-brown hover:text-black"}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Link>
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
                  <Td>
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium hover:text-accent"
                    >
                      #{order.number}
                    </Link>
                    <p className="text-xs text-muted">{DATE.format(order.createdAt)}</p>
                  </Td>
                  <Td>
                    <p className="font-medium">{order.name}</p>
                    <p className="text-xs text-muted">
                      <ClickableCopyableText value={order.phone} label="phone number" />
                    </p>
                  </Td>
                  <Td className="text-muted">{order.city}</Td>
                  <Td className="text-muted">
                    {units} {units === 1 ? "item" : "items"}
                  </Td>
                  <Td className="font-medium">${Number(order.total)}</Td>
                  <Td>
                    {order.archivedAt ? (
                      <Badge tone="warn">Archived</Badge>
                    ) : (
                      <StatusSelect id={order.id} status={order.status} />
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
    </>
  );
}
