import "server-only";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import {
  passwordChanged,
  passwordResetCode,
  verificationCode as verificationCodeEmail,
} from "@/lib/email/templates";
import { CODE_TTL_MINUTES, TooSoonError, checkCode, issueCode } from "@/lib/verification";

/**
 * Storefront customer accounts.
 *
 * Deliberately separate from the dashboard's `session.ts`: staff sign in with a
 * cookie on the dashboard's own origin, whereas a customer's session is created
 * here and handed to the storefront as an opaque token, which the storefront
 * keeps in an httpOnly cookie on *its* origin and replays as a header. Nothing
 * about a customer session can reach a dashboard screen.
 */

/**
 * A day by default; a month when the shopper ticks "remember me". The token is
 * the storefront's to keep, so the expiry travels back with it — the storefront
 * gives its own cookie the same lifetime.
 */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const REMEMBERED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(160),
  email: z.email("That does not look like an email address.").trim().toLowerCase().max(255),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200)
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
  /** Keeps the session alive for a month instead of a day. */
  remember: z.coerce.boolean().optional().default(false),
});

const emailOnlySchema = z.object({
  email: z.email("That does not look like an email address.").trim().toLowerCase().max(255),
});

export const verifySchema = emailOnlySchema.extend({
  code: z.string().trim().min(4).max(10),
  remember: z.coerce.boolean().optional().default(false),
});

export const resendSchema = emailOnlySchema;
export const forgotPasswordSchema = emailOnlySchema;

export const resetPasswordSchema = emailOnlySchema.extend({
  code: z.string().trim().min(4).max(10),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200)
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(160),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
});

export interface PublicCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
}

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  city: true,
} as const;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number = 400
  ) {
    super(message);
  }
}

/**
 * Right password, unproven address. Its own class so the route can answer with
 * a flag the storefront branches on — it needs to open the code screen rather
 * than show "wrong password".
 */
export class UnverifiedEmailError extends AccountError {
  constructor() {
    super("Confirm your email address to sign in. We have sent you a new code.", 403);
  }
}

/** Never let an empty string reach a nullable column as "". */
const orNull = (value: string | undefined) => (value?.trim() ? value.trim() : null);

/**
 * Signing up no longer signs you in.
 *
 * The account is created unverified and a code goes to the address given; the
 * session is issued by `verifyCustomerEmail` once that code comes back. It is
 * the one moment we can prove the address belongs to whoever typed it, and an
 * order confirmation is worth nothing sent to a typo.
 */
export async function registerCustomer(
  input: z.infer<typeof registerSchema>
): Promise<{ customer: PublicCustomer; verificationRequired: true }> {
  const existing = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true, emailVerifiedAt: true },
  });

  if (existing) {
    // An abandoned, never-verified sign-up should not lock the address forever;
    // whoever holds the inbox can start again.
    if (existing.emailVerifiedAt) {
      throw new AccountError("An account already uses that email address.", 409);
    }

    const restarted = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, 12),
        phone: orNull(input.phone),
        address: orNull(input.address),
        city: orNull(input.city),
      },
      select: PUBLIC_FIELDS,
    });

    await sendVerificationCode(restarted);
    return { customer: restarted, verificationRequired: true };
  }

  const customer = await prisma.customer.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 12),
      phone: orNull(input.phone),
      address: orNull(input.address),
      city: orNull(input.city),
    },
    select: PUBLIC_FIELDS,
  });

  await sendVerificationCode(customer);
  return { customer, verificationRequired: true };
}

async function sendVerificationCode(customer: PublicCustomer): Promise<void> {
  const code = await issueCode({
    email: customer.email,
    purpose: "EMAIL_VERIFICATION",
    customerId: customer.id,
  });

  await sendEmail(
    verificationCodeEmail(
      { name: customer.name, code, minutes: CODE_TTL_MINUTES },
      customer.email
    )
  );
}

/** Another code for someone who lost the first one. */
export async function resendVerification(email: string): Promise<void> {
  const row = await prisma.customer.findUnique({
    where: { email },
    select: { ...PUBLIC_FIELDS, emailVerifiedAt: true },
  });

  // Silent when there is nothing to send to: whether an address has an account
  // is not something this endpoint should confirm to a stranger.
  if (!row || row.emailVerifiedAt) return;

  const { emailVerifiedAt: _verified, ...customer } = row;
  try {
    await sendVerificationCode(customer);
  } catch (error) {
    if (error instanceof TooSoonError) throw new AccountError(error.message, 429);
    throw error;
  }
}

/** The code came back: mark the address proven and sign the shopper in. */
export async function verifyCustomerEmail(
  input: z.infer<typeof verifySchema>,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date; customer: PublicCustomer }> {
  const check = await checkCode(input.email, "EMAIL_VERIFICATION", input.code);
  if (!check.ok) throw new AccountError(check.error, 400);

  const row = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { ...PUBLIC_FIELDS, archivedAt: true },
  });
  if (!row || row.archivedAt) throw new AccountError("That account is not available.", 404);

  const { archivedAt: _archived, ...customer } = row;

  await prisma.customer.update({
    where: { id: customer.id },
    data: { emailVerifiedAt: new Date(), lastLoginAt: new Date() },
  });

  const session = await startSession(customer.id, meta, input.remember);
  return { ...session, customer };
}

/**
 * Starts a reset. Always succeeds from the outside — an address with no account
 * gets the same answer as one with, so this cannot be used to enumerate
 * customers — but only a real account is sent anything.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!customer || customer.archivedAt) return;

  try {
    const code = await issueCode({
      email,
      purpose: "PASSWORD_RESET",
      customerId: customer.id,
    });
    await sendEmail(
      passwordResetCode({ name: customer.name, code, minutes: CODE_TTL_MINUTES }, email)
    );
  } catch (error) {
    // A cooldown is not the caller's business either — they were told a code is
    // on its way, and one already is.
    if (!(error instanceof TooSoonError)) throw error;
  }
}

/**
 * Finishes a reset: new password, and every existing session revoked. If the
 * password was reset because somebody else had it, they are signed out too.
 */
export async function resetCustomerPassword(
  input: z.infer<typeof resetPasswordSchema>
): Promise<void> {
  const check = await checkCode(input.email, "PASSWORD_RESET", input.code);
  if (!check.ok) throw new AccountError(check.error, 400);

  const customer = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true, archivedAt: true },
  });
  if (!customer || customer.archivedAt) {
    throw new AccountError("That account is not available.", 404);
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: customer.id },
      data: {
        passwordHash,
        // Proving the code also proves the address, for an account that never
        // got round to it.
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.customerSession.updateMany({
      where: { customerId: customer.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await sendEmail(passwordChanged(input.email, new Date()));
}

export async function loginCustomer(
  input: z.infer<typeof loginSchema>,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date; customer: PublicCustomer }> {
  const row = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { ...PUBLIC_FIELDS, passwordHash: true, archivedAt: true, emailVerifiedAt: true },
  });

  // Compare against a dummy hash when there is no such account, so a wrong
  // email and a wrong password take the same amount of time to fail.
  const hash = row?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const matches = await bcrypt.compare(input.password, hash);

  if (!row || row.archivedAt || !matches) {
    throw new AccountError("Those details do not match an account.", 401);
  }

  // The password was right, so saying the address is unverified gives nothing
  // away — and a fresh code saves them hunting for the old email.
  if (!row.emailVerifiedAt) {
    const { passwordHash: _p, archivedAt: _a, emailVerifiedAt: _v, ...unverified } = row;
    try {
      await sendVerificationCode(unverified);
    } catch (error) {
      if (!(error instanceof TooSoonError)) throw error;
    }
    throw new UnverifiedEmailError();
  }

  await prisma.customer.update({
    where: { id: row.id },
    data: { lastLoginAt: new Date() },
  });

  const {
    passwordHash: _hash,
    archivedAt: _archived,
    emailVerifiedAt: _verified,
    ...customer
  } = row;
  const session = await startSession(customer.id, meta, input.remember);
  return { ...session, customer };
}

async function startSession(
  customerId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null },
  remember = false
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (remember ? REMEMBERED_TTL_MS : SESSION_TTL_MS));

  await prisma.customerSession.create({
    data: {
      customerId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 60) ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });

  return { token, expiresAt };
}

/**
 * Resolves a session token to a customer, or null. Like the dashboard's data
 * access layer, the database row is the authority — archiving an account or
 * revoking a session takes effect on the very next request.
 */
export async function customerFromToken(token: string | null): Promise<PublicCustomer | null> {
  if (!token) return null;

  const session = await prisma.customerSession.findFirst({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { customer: { select: { ...PUBLIC_FIELDS, archivedAt: true } } },
  });

  if (!session?.customer || session.customer.archivedAt) return null;

  const { archivedAt: _archived, ...customer } = session.customer;
  return customer;
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  await prisma.customerSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function updateProfile(
  customerId: string,
  input: z.infer<typeof profileSchema>
): Promise<PublicCustomer> {
  return prisma.customer.update({
    where: { id: customerId },
    data: {
      name: input.name,
      phone: orNull(input.phone),
      address: orNull(input.address),
      city: orNull(input.city),
    },
    select: PUBLIC_FIELDS,
  });
}

/** A customer's own order history, shaped like the storefront's other reads. */
export async function customerOrders(customerId: string) {
  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      status: true,
      total: true,
      createdAt: true,
      name: true,
      phone: true,
      address: true,
      city: true,
      notes: true,
      payment: true,
      items: {
        select: {
          id: true,
          slug: true,
          title: true,
          unitPrice: true,
          quantity: true,
          product: { select: { coverImage: true } },
        },
      },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    Reference: order.reference,
    Status: STATUS_LABEL[order.status],
    Total: String(Number(order.total)),
    Placed: order.createdAt.toISOString(),
    Payment: order.payment,
    Name: order.name,
    Phone: order.phone,
    Address: order.address,
    City: order.city,
    Notes: order.notes ?? "",
    Items: order.items.map((item) => ({
      id: item.id,
      Slug: item.slug,
      Title: item.title,
      Image: item.product?.coverImage ?? "",
      UnitPrice: String(Number(item.unitPrice)),
      Qty: item.quantity,
    })),
  }));
}

const STATUS_LABEL = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  CANCELLED: "Cancelled",
} as const;
