import "server-only";

import {
  HERO_IMAGE,
  codeBlock,
  definitionList,
  escapeHtml,
  heading,
  itemsTable,
  money,
  paragraph,
  rawParagraph,
  shell,
  type LineItem,
} from "@/lib/email/layout";
import { DASHBOARD_URL, STOREFRONT_URL, type OutgoingEmail } from "@/lib/email/send";
import type { OrderStatus } from "@prisma/client";

/**
 * Every message the shop sends, as one function each: subject line and body
 * together, so what lands in an inbox can be read in one place.
 */

export interface OrderEmailData {
  id: string;
  /** What the shopper is told. `number` is the shop's own sequence, and stays in. */
  reference: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  notes?: string | null;
  payment: string;
  total: string;
  items: LineItem[];
}

/** Sent to the shop when an order lands. */
export function orderPlacedOwner(order: OrderEmailData, to: string): OutgoingEmail {
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    to,
    subject: `New order ${order.reference} — ${money(order.total)}`,
    html: shell({
      preheader: `${order.name} · ${units} ${units === 1 ? "item" : "items"} · ${order.city}`,
      eyebrow: "New order",
      heading: `${order.reference} — ${order.name}`,
      body: [
        itemsTable(order.items, order.total),
        heading("Deliver to"),
        definitionList([
          ["Name", order.name],
          ["Phone", order.phone],
          ["Address", order.address],
          ["City", order.city],
          ["Payment", order.payment],
          ["Notes", order.notes ?? ""],
        ]),
      ].join(""),
      cta: { label: "Open in dashboard", href: `${DASHBOARD_URL}/orders/${order.id}` },
      footnote: "Call to confirm before dispatch.",
    }),
  };
}

/** Sent to the shopper the moment their order is filed. */
export function orderPlacedCustomer(order: OrderEmailData, to: string): OutgoingEmail {
  const firstName = order.name.trim().split(/\s+/)[0] || "there";

  return {
    to,
    subject: `Your Glaze order ${order.reference}`,
    html: shell({
      hero: { src: HERO_IMAGE, alt: "" },
      preheader: `We have your order — ${money(order.total)}, paid ${order.payment.toLowerCase()}.`,
      eyebrow: `Order ${order.reference}`,
      heading: `Thank you, ${firstName}`,
      body: [
        paragraph("Your order is in and we are getting it ready for delivery."),
        heading("What you ordered"),
        itemsTable(order.items, order.total),
        heading("Delivering to"),
        definitionList([
          ["Address", order.address],
          ["City", order.city],
          ["Payment", order.payment],
        ]),
      ].join(""),
      ...(STOREFRONT_URL
        ? { cta: { label: "Keep shopping", href: STOREFRONT_URL } }
        : {}),
      footnote:
        "Something not right? Reply to this email and we will sort it out.",
    }),
  };
}

/**
 * What the shopper is told at each step of an order's life.
 *
 * `PENDING` is deliberately absent. It is the state an order is created in, so
 * the confirmation sent at checkout already covers it — and a shop correcting
 * a mis-clicked status should not send "your order is pending" to someone who
 * was told yesterday it had shipped.
 */
const STATUS_EMAIL: Partial<
  Record<OrderStatus, { eyebrow: string; heading: string; body: string; footnote: string }>
> = {
  CONFIRMED: {
    eyebrow: "Order confirmed",
    heading: "Your order is confirmed",
    body: "Everything you ordered is in stock and we are putting it together now. We will let you know the moment it goes out for delivery.",
    footnote: "Questions about this order? Reply to this email.",
  },
  SHIPPED: {
    eyebrow: "On its way",
    heading: "Your order is on its way",
    body: "Your order has left us and is with the courier. They will call the number on the order before they arrive, so keep it to hand.",
    footnote: "Payment is cash on delivery — please have the amount below ready for the courier.",
  },
  DELIVERED: {
    eyebrow: "Delivered",
    heading: "Your order has arrived",
    body: "Your order has been delivered. We hope you love it — and if anything is not right, tell us and we will put it straight.",
    footnote: "Something not right? Reply to this email and we will sort it out.",
  },
  CANCELLED: {
    eyebrow: "Cancelled",
    heading: "Your order was cancelled",
    body: "This order has been cancelled and there is nothing to pay. Nothing will arrive, and the courier will not call.",
    footnote: "If you were not expecting this, reply to this email and we will look into it.",
  },
};

/** Whether a move to this status is worth telling the shopper about. */
export function statusEmailExists(status: OrderStatus): boolean {
  return status in STATUS_EMAIL;
}

/**
 * Sent to the shopper when the shop moves an order along. Returns null for a
 * status with nothing worth saying, so the caller simply does not send.
 */
export function orderStatusChanged(
  order: OrderEmailData,
  status: OrderStatus,
  to: string
): OutgoingEmail | null {
  const copy = STATUS_EMAIL[status];
  if (!copy) return null;

  const firstName = order.name.trim().split(/\s+/)[0] || "there";

  return {
    to,
    subject: `${copy.heading} — order ${order.reference}`,
    html: shell({
      preheader: `Order ${order.reference} — ${copy.heading.toLowerCase()}.`,
      eyebrow: copy.eyebrow,
      heading: copy.heading,
      body: [
        paragraph(`${firstName}, ${copy.body.charAt(0).toLowerCase()}${copy.body.slice(1)}`),
        heading("What you ordered"),
        itemsTable(order.items, order.total),
        // Where it is going matters while it is still coming; once it has
        // arrived or been called off, repeating the address is just noise.
        ...(status === "SHIPPED" || status === "CONFIRMED"
          ? [
              heading("Delivering to"),
              definitionList([
                ["Address", order.address],
                ["City", order.city],
                ["Payment", order.payment],
              ]),
            ]
          : []),
      ].join(""),
      ...(STOREFRONT_URL && status === "DELIVERED"
        ? { cta: { label: "Shop again", href: STOREFRONT_URL } }
        : {}),
      footnote: copy.footnote,
    }),
  };
}

/** Sent to the shop when the storefront's "Say hello" form is submitted. */
export function contactMessage(
  message: { name: string; email: string; phone?: string | null; subject?: string | null; message: string },
  to: string
): OutgoingEmail {
  return {
    to,
    subject: message.subject
      ? `Say hello — ${message.subject}`
      : `Say hello — ${message.name}`,
    // Replying to the email replies to the person who wrote in.
    replyTo: message.email,
    html: shell({
      preheader: message.message.slice(0, 120),
      eyebrow: "Say hello",
      heading: "Someone said hello",
      body: [
        definitionList([
          ["From", message.name],
          ["Email", message.email],
          ["Phone", message.phone ?? ""],
          ["Subject", message.subject ?? ""],
        ]),
        heading("Message"),
        rawParagraph(escapeHtml(message.message).replace(/\n/g, "<br>")),
      ].join(""),
      footnote: "Hit reply to answer them directly.",
    }),
  };
}

export interface CodeEmailData {
  name?: string | null;
  code: string;
  /** How long the code is good for, in minutes. */
  minutes: number;
}

/** The code that turns a new sign-up into a verified account. */
export function verificationCode(data: CodeEmailData, to: string): OutgoingEmail {
  const firstName = (data.name ?? "").trim().split(/\s+/)[0];

  return {
    to,
    subject: `${data.code} is your Glaze verification code`,
    html: shell({
      centered: true,
      preheader: `Your code is ${data.code}. It expires in ${data.minutes} minutes.`,
      eyebrow: "Verify your email",
      heading: firstName ? `Welcome, ${firstName}` : "Confirm your email",
      body: [
        paragraph("Enter this code to confirm your email address:"),
        codeBlock(data.code),
        paragraph(
          `The code is good for ${data.minutes} minutes. If you did not create a Glaze account, you can ignore this email.`
        ),
      ].join(""),
    }),
  };
}

/** The code that lets someone set a new password. */
export function passwordResetCode(data: CodeEmailData, to: string): OutgoingEmail {
  return {
    to,
    subject: `${data.code} is your Glaze password reset code`,
    html: shell({
      centered: true,
      preheader: `Your reset code is ${data.code}. It expires in ${data.minutes} minutes.`,
      eyebrow: "Password reset",
      heading: "Reset your password",
      body: [
        paragraph("Use this code to choose a new password:"),
        codeBlock(data.code),
        paragraph(
          `The code is good for ${data.minutes} minutes and can be used once. If you did not ask for it, nothing has changed on your account — you can ignore this email.`
        ),
      ].join(""),
    }),
  };
}

/** Confirmation that a password actually changed, so a theft is noticed. */
export function passwordChanged(to: string, when: Date): OutgoingEmail {
  return {
    to,
    subject: "Your Glaze password was changed",
    html: shell({
      preheader: "If this was not you, get in touch straight away.",
      eyebrow: "Security",
      heading: "Your password was changed",
      body: [
        paragraph(
          `The password on this account was changed on ${when.toUTCString()}. Every other session has been signed out.`
        ),
        paragraph("If that was not you, reply to this email immediately."),
      ].join(""),
    }),
  };
}
