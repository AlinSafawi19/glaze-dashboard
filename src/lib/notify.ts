import "server-only";

import { Resend } from "resend";

import { prisma } from "@/lib/prisma";

/**
 * What happens when an order lands: a row in the dashboard's notification
 * inbox, and an email to the shop owner.
 *
 * Both are best-effort. Neither is allowed to fail the checkout — the order is
 * already committed by the time these run, and a shopper must never see an
 * error because an email provider was down.
 */

const FROM = process.env.RESEND_FROM ?? "";
const TO = process.env.STORE_EMAIL ?? "";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3002";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface PlacedOrder {
  id: string;
  number: number;
  name: string;
  phone: string;
  address: string;
  city: string;
  total: string;
  items: Array<{ title: string; quantity: number; unitPrice: string }>;
}

export async function announceOrder(order: PlacedOrder): Promise<void> {
  await Promise.allSettled([recordNotification(order), emailOwner(order)]);
}

async function recordNotification(order: PlacedOrder): Promise<void> {
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

  try {
    await prisma.notification.create({
      data: {
        type: "order.placed",
        title: `New order #${order.number}`,
        body: `${order.name} · ${units} ${units === 1 ? "item" : "items"} · $${order.total} · ${order.city}`,
        resourceId: order.id,
        href: `/orders/${order.id}`,
      },
    });
  } catch (error) {
    console.error("[notify] could not record notification", error);
  }
}

function money(value: string): string {
  return `$${Number(value)}`;
}

function emailBody(order: PlacedOrder): string {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e6ddd4;">${escapeHtml(item.title)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #e6ddd4;text-align:right;">${item.quantity} × ${money(item.unitPrice)}</td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;background:#fdf4f8;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#7b3a56;">GLAZE</p>
      <h1 style="margin:0 0 24px;font-size:22px;color:#000000;">New order #${order.number}</h1>

      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#000000;">
        ${rows}
        <tr>
          <td style="padding:12px 0;font-weight:600;">Total</td>
          <td style="padding:12px 0;text-align:right;font-weight:600;">${money(order.total)}</td>
        </tr>
      </table>

      <h2 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#4a2b39;">Deliver to</h2>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#000000;">
        ${escapeHtml(order.name)}<br>
        ${escapeHtml(order.phone)}<br>
        ${escapeHtml(order.address)}<br>
        ${escapeHtml(order.city)}
      </p>

      <p style="margin:28px 0 0;">
        <a href="${DASHBOARD_URL}/orders/${order.id}"
           style="display:inline-block;background:#000000;color:#f5b7cf;padding:12px 24px;text-decoration:none;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">
          Open in dashboard
        </a>
      </p>

      <p style="margin:24px 0 0;font-size:12px;color:#6f6259;">
        Cash on delivery — call to confirm before dispatch.
      </p>
    </div>
  </div>`;
}

/** Customer-supplied strings land in an HTML email; escape them. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function emailOwner(order: PlacedOrder): Promise<void> {
  if (!resend || !FROM || !TO) {
    // Not configured — the dashboard notification still fires, so this is a
    // missing integration rather than a lost order.
    console.warn("[notify] Resend is not configured; skipping owner email");
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: TO,
      subject: `New order #${order.number} — ${money(order.total)}`,
      html: emailBody(order),
    });
  } catch (error) {
    console.error("[notify] could not send owner email", error);
  }
}
