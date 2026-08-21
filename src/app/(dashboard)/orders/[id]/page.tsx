import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionButton } from "@/components/confirm-button";
import { StatusSelect } from "@/components/status-select";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { archiveOrder, deleteOrder, restoreOrder } from "@/lib/actions/orders";
import { getCurrentUser } from "@/lib/dal";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { ClickableCopyableText, CopyableText } from "@/components/text";

export const metadata: Metadata = { title: "Order" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, user] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { slug: true } } } },
        customer: { select: { id: true, name: true, email: true } },
      },
    }),
    getCurrentUser(),
  ]);

  if (!order) notFound();

  return (
    <>
      <PageHeader
        title={`Order #${order.number}`}
        subtitle={DATE.format(order.createdAt)}
        action={
          <div className="flex items-center gap-2">
            {order.archivedAt ? (
              <>
                <ActionButton
                  action={restoreOrder.bind(null, order.id)}
                  label="Restore"
                  variant="row"
                  confirmTitle="Restore this order?"
                  confirm="It returns to the inbox and its status becomes editable again."
                  confirmLabel="Restore"
                />
                {user?.role === "OWNER" && (
                  <ActionButton
                    action={deleteOrder.bind(null, order.id)}
                    label="Delete"
                    variant="rowDanger"
                    confirmTitle="Delete this order for good?"
                    confirm="The customer's details and the line items go with it. This cannot be undone."
                    confirmLabel="Delete permanently"
                  />
                )}
              </>
            ) : (
              <>
                <StatusSelect id={order.id} status={order.status} />
                <ActionButton
                  action={archiveOrder.bind(null, order.id)}
                  label="Archive"
                  variant="row"
                  confirmTitle="Archive this order?"
                  confirm="It stays on record but leaves the inbox, and its status can no longer be changed."
                  confirmLabel="Archive"
                />
              </>
            )}
          </div>
        }
      />

      <div className="mb-6 flex items-center gap-3">
        <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
        {order.archivedAt && <Badge tone="warn">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Unit</Th>
                <Th>Qty</Th>
                <Th className="text-right">Line total</Th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted">/{item.slug}</p>
                  </Td>
                  <Td className="text-muted">${Number(item.unitPrice)}</Td>
                  <Td className="text-muted">{item.quantity}</Td>
                  <Td className="text-right font-medium">
                    ${Number(item.unitPrice) * item.quantity}
                  </Td>
                </tr>
              ))}
              <tr>
                <Td colSpan={3} className="text-right font-medium">
                  Total
                </Td>
                <Td className="text-right text-base font-semibold">
                  ${Number(order.total)}
                </Td>
              </tr>
            </tbody>
          </Table>

          {order.notes && (
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Customer notes
              </p>
              <p className="mt-1.5 text-sm whitespace-pre-wrap">{order.notes}</p>
            </Card>
          )}
        </div>

        <Card className="flex flex-col gap-4 p-5">
          <Detail label="Name">{order.name}</Detail>
          <Detail label="Phone">
            {/* The number staff dial most often, so it wears full ink. The
                accent pink this used to be sits near 2:1 on white — decorative
                weight on the one field that has to be readable at a glance. */}
            <ClickableCopyableText value={order.phone} label="phone number" />
          </Detail>
          <Detail label="Address">
            {/* Copied straight into the courier's form, so it is one click
                rather than a careful drag across two lines. */}
            <CopyableText value={order.address} label="address" />
          </Detail>
          <Detail label="City">{order.city}</Detail>
          <Detail label="Payment">{order.payment}</Detail>
          {order.email && (
            <Detail label="Email">
              <ClickableCopyableText value={order.email} label="email address" />
            </Detail>
          )}
          <Detail label="Account">
            {order.customer ? (
              <ClickableCopyableText
                value={order.customer.email}
                href={`/customers/${order.customer.id}`}
                label="email address"
              />
            ) : (
              "Guest checkout"
            )}
          </Detail>
        </Card>
      </div>
    </>
  );
}
