"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { pushOrderChanged } from "@/lib/realtime";
import { requireOwner, requireUserForAction } from "@/lib/dal";
import { ORDER_STATUSES, STATUS_LABEL, canMoveTo } from "@/lib/order-status";
import { sendEmail } from "@/lib/email/send";
import { orderStatusChanged } from "@/lib/email/templates";

function refresh(id?: string) {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/orders/${id}`);
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await requireUserForAction();
  if (!ORDER_STATUSES.includes(status)) throw new Error("Unknown status.");

  // The status control is hidden on archived orders; enforce that here too,
  // since hiding a control is not the same as preventing the action.
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      archivedAt: true,
      status: true,
      reference: true,
      name: true,
      phone: true,
      address: true,
      city: true,
      notes: true,
      payment: true,
      email: true,
      total: true,
      stockTaken: true,
      items: {
        select: { title: true, quantity: true, unitPrice: true, productId: true },
      },
    },
  });
  if (!order) throw new Error("That order no longer exists.");
  if (order.archivedAt) throw new Error("Restore this order before changing its status.");

  // Nothing to do, and nothing to email about — two people working the list at
  // once will both click the same button sooner or later.
  if (order.status === status) return;

  // Orders move forward or they are cancelled. Enforced here rather than only
  // in the buttons, because the action is reachable without them.
  if (!canMoveTo(order.status, status)) {
    throw new Error(
      `An order that is ${STATUS_LABEL[order.status].toLowerCase()} cannot be moved to ${STATUS_LABEL[status].toLowerCase()}.`
    );
  }

  if (status === "CANCELLED" && order.stockTaken) {
    // Cancelling puts the units back on the shelf, in the same transaction as
    // the status itself — a cancelled order that quietly kept holding its stock
    // would show the shop as sold out of something sitting in the stockroom.
    //
    // `stockTaken` is cleared as part of it, so this can only run once. The
    // increment is scoped to products that are still stock-tracked: one that
    // was switched to untracked in the meantime has no count to give back to.
    await prisma.$transaction([
      ...order.items
        .filter((item) => item.productId !== null)
        .map((item) =>
          prisma.product.updateMany({
            where: { id: item.productId!, stock: { not: null } },
            data: { stock: { increment: item.quantity } },
          })
        ),
      prisma.order.update({ where: { id }, data: { status, stockTaken: false } }),
    ]);
  } else {
    await prisma.order.update({ where: { id }, data: { status } });
  }

  // Best-effort, and after the commit: the status has already changed, and the
  // shop must not see the update fail because an email provider had a bad
  // minute. Guests who left no address simply get nothing.
  if (order.email) {
    const email = orderStatusChanged(
      {
        id,
        reference: order.reference,
        name: order.name,
        phone: order.phone,
        address: order.address,
        city: order.city,
        notes: order.notes,
        payment: order.payment,
        total: String(Number(order.total)),
        items: order.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          unitPrice: String(Number(item.unitPrice)),
        })),
      },
      status,
      order.email
    );
    if (email) await sendEmail(email).catch(() => false);
  }

  // Two people often work the order list at once; tell the other tabs so they
  // do not sit on a status that has already moved.
  pushOrderChanged(id, status);
  refresh(id);
}

/** Clears an order out of the inbox without losing the record. */
export async function archiveOrder(id: string): Promise<void> {
  await requireUserForAction();
  await prisma.order.update({ where: { id }, data: { archivedAt: new Date() } });
  refresh(id);
}

export async function restoreOrder(id: string): Promise<void> {
  await requireUserForAction();
  await prisma.order.update({ where: { id }, data: { archivedAt: null } });
  refresh(id);
}

export async function deleteOrder(id: string): Promise<void> {
  await requireOwner();

  const order = await prisma.order.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!order?.archivedAt) throw new Error("Archive it first.");

  await prisma.order.delete({ where: { id } });
  refresh();
}
