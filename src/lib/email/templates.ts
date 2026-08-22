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

/**
 * Every message the shop sends, as one function each: subject line and body
 * together, so what lands in an inbox can be read in one place.
 */

export interface OrderEmailData {
  id: string;
  number: number;
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
    subject: `New order #${order.number} — ${money(order.total)}`,
    html: shell({
      preheader: `${order.name} · ${units} ${units === 1 ? "item" : "items"} · ${order.city}`,
      eyebrow: "New order",
      heading: `#${order.number} — ${order.name}`,
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
    subject: `Your Glaze order #${order.number}`,
    html: shell({
      hero: { src: HERO_IMAGE, alt: "" },
      preheader: `We have your order — ${money(order.total)}, paid ${order.payment.toLowerCase()}.`,
      eyebrow: `Order #${order.number}`,
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
