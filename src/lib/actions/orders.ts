"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { pushOrderChanged } from "@/lib/realtime";
import { requireOwner, requireUserForAction } from "@/lib/dal";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";

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
    select: { archivedAt: true },
  });
  if (!order) throw new Error("That order no longer exists.");
  if (order.archivedAt) throw new Error("Restore this order before changing its status.");

  await prisma.order.update({ where: { id }, data: { status } });

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
