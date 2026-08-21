import "server-only";

import { prisma } from "@/lib/prisma";
import { OWNER_EMAIL, sendEmail } from "@/lib/email/send";
import { orderPlacedCustomer, orderPlacedOwner, type OrderEmailData } from "@/lib/email/templates";
import { pushNotification } from "@/lib/realtime";

/**
 * What happens when an order lands: a row in the dashboard's notification
 * inbox, pushed to every open dashboard over the socket, an email to the shop,
 * and a confirmation to the shopper.
 *
 * All of it is best-effort. None of it is allowed to fail the checkout — the
 * order is already committed by the time these run, and a shopper must never
 * see an error because an email provider was down.
 */

export interface PlacedOrder extends OrderEmailData {
  /** Where the confirmation goes; absent for a guest who left no address. */
  email?: string | null;
}

export async function announceOrder(order: PlacedOrder): Promise<void> {
  await Promise.allSettled([
    recordNotification(order),
    emailOwner(order),
    emailCustomer(order),
  ]);
}

async function recordNotification(order: PlacedOrder): Promise<void> {
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

  try {
    const row = await prisma.notification.create({
      data: {
        type: "order.placed",
        title: `New order #${order.number}`,
        body: `${order.name} · ${units} ${units === 1 ? "item" : "items"} · $${order.total} · ${order.city}`,
        resourceId: order.id,
        href: `/orders/${order.id}`,
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    });

    // Straight to every dashboard that is open right now. The bell also polls,
    // so a shop with no socket server still sees it within the minute.
    pushNotification({
      ...row,
      readAt: null,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("[notify] could not record notification", error);
  }
}

async function emailOwner(order: PlacedOrder): Promise<void> {
  if (!OWNER_EMAIL) {
    console.warn("[notify] STORE_EMAIL is not set; skipping owner email");
    return;
  }

  const email = orderPlacedOwner(order, OWNER_EMAIL);
  // Replying to the shop's copy should reach the shopper, when there is one.
  await sendEmail(order.email ? { ...email, replyTo: order.email } : email);
}

async function emailCustomer(order: PlacedOrder): Promise<void> {
  if (!order.email) return;
  await sendEmail(orderPlacedCustomer(order, order.email));
}
