import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/confirm-button";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import {
  archiveCustomer,
  deleteCustomer,
  restoreCustomer,
} from "@/lib/actions/customers";
import { getCurrentUser } from "@/lib/dal";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Customer" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-sm text-brown">{label}</p>
      <p className="mt-0.5 font-inter text-[14px] font-light">{children}</p>
    </div>
  );
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [customer, user] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            city: true,
            createdAt: true,
            archivedAt: true,
            items: { select: { quantity: true } },
          },
        },
        _count: { select: { sessions: { where: { revokedAt: null } } } },
      },
    }),
    getCurrentUser(),
  ]);

  if (!customer) notFound();

  const spent = customer.orders
    .filter((order) => order.status !== "CANCELLED" && !order.archivedAt)
    .reduce((sum, order) => sum + Number(order.total), 0);

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={customer.email}
        action={
          <div className="flex items-center gap-1">
            {customer.archivedAt ? (
              <>
                <ActionButton
                  action={restoreCustomer.bind(null, customer.id)}
                  label="Restore"
                  variant="row"
                  confirmTitle="Restore this account?"
                  confirm="They will be able to sign in again."
                  confirmLabel="Restore"
                />
                {user?.role === "OWNER" && (
                  <ActionButton
                    action={deleteCustomer.bind(null, customer.id)}
                    label="Delete"
                    variant="rowDanger"
                    confirmTitle="Delete this account for good?"
                    confirm="This cannot be undone. Their orders stay on record — each one keeps its own copy of the name, phone and address — but they are no longer linked to an account."
                    confirmLabel="Delete permanently"
                  />
                )}
              </>
            ) : (
              <ActionButton
                action={archiveCustomer.bind(null, customer.id)}
                label="Archive"
                variant="row"
                confirmTitle="Archive this account?"
                confirm="They are signed out everywhere immediately and cannot sign in again until restored. Their orders are untouched."
                confirmLabel="Archive"
              />
            )}
          </div>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        {customer.archivedAt ? (
          <Badge tone="warn">Archived</Badge>
        ) : (
          <Badge tone="success">Active</Badge>
        )}
      </div>

      <div className="grid gap-6 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section>
          <h2 className="mb-3 text-[16px]">Order history</h2>
          {customer.orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="They have an account but have not checked out."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Items</Th>
                  <Th>City</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {customer.orders.map((order) => {
                  const units = order.items.reduce((sum, i) => sum + i.quantity, 0);
                  return (
                    <tr key={order.id}>
                      <Td>
                        <Link
                          href={`/orders/${order.id}`}
                          className="transition-colors hover:text-plum"
                        >
                          #{order.number}
                        </Link>
                        <p className="font-inter text-[12px] font-light text-brown">
                          {DATE.format(order.createdAt)}
                        </p>
                      </Td>
                      <Td className="text-brown">{units}</Td>
                      <Td className="text-brown">{order.city}</Td>
                      <Td className="tabular-nums">${Number(order.total)}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[order.status]}>
                          {STATUS_LABEL[order.status]}
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>

        <div className="h-fit">
          {/* An empty line the exact height of the "Order history" heading on
              the left, so the card starts level with the order list rather
              than with its title. Deliberately blank, not a second heading. */}
          <p className="mb-3 text-[16px] leading-[1.4] select-none" aria-hidden>
            &nbsp;
          </p>
          <Card className="flex flex-col gap-4 p-5">
            <Detail label="Email">{customer.email}</Detail>
            <Detail label="Phone">
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="text-plum underline">
                  {customer.phone}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Address">{customer.address ?? "—"}</Detail>
            <Detail label="City">{customer.city ?? "—"}</Detail>
            <Detail label="Joined">{DATE.format(customer.createdAt)}</Detail>
            <Detail label="Last signed in">
              {customer.lastLoginAt ? DATE.format(customer.lastLoginAt) : "Never"}
            </Detail>
            <Detail label="Active sessions">{customer._count.sessions}</Detail>
            <Detail label="Total spent">
              <span className="tabular-nums">${spent}</span>
            </Detail>
          </Card>
        </div>
      </div>
    </>
  );
}
