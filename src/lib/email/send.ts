import "server-only";

import { Resend } from "resend";

/**
 * Every email the app sends goes through here.
 *
 * Sending is best-effort by design: an order is already committed, a code is
 * already stored, and a shopper must never see a checkout fail because an email
 * provider had a bad minute. Failures are logged and reported in the return
 * value; callers decide whether that matters to them.
 */

const KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.RESEND_FROM ?? "";

/** Where owner-facing mail goes: new orders, contact messages. */
export const OWNER_EMAIL = process.env.STORE_EMAIL ?? "";

export const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3002";
export const STOREFRONT_URL = process.env.STOREFRONT_URL ?? "";

const resend = KEY ? new Resend(KEY) : null;

export interface OutgoingEmail {
  to: string | string[];
  subject: string;
  html: string;
  /** For owner mail about a shopper — hitting reply should reach the shopper. */
  replyTo?: string;
}

export function emailConfigured(): boolean {
  return Boolean(resend && FROM);
}

export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const to = Array.isArray(email.to) ? email.to.filter(Boolean) : [email.to];
  if (to.length === 0) return false;

  if (!resend || !FROM) {
    // A missing integration, not a lost order — say so loudly in the log and
    // let the caller carry on.
    console.warn(
      `[email] RESEND_API_KEY/RESEND_FROM not set; skipped "${email.subject}" to ${to.join(", ")}`
    );
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: email.subject,
      html: email.html,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    });

    if (error) {
      console.error(`[email] Resend refused "${email.subject}"`, error);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[email] could not send "${email.subject}"`, error);
    return false;
  }
}
