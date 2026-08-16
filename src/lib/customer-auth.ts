import "server-only";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

/**
 * Storefront customer accounts.
 *
 * Deliberately separate from the dashboard's `session.ts`: staff sign in with a
 * cookie on the dashboard's own origin, whereas a customer's session is created
 * here and handed to the storefront as an opaque token, which the storefront
 * keeps in an httpOnly cookie on *its* origin and replays as a header. Nothing
 * about a customer session can reach a dashboard screen.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

/** Never let an empty string reach a nullable column as "". */
const orNull = (value: string | undefined) => (value?.trim() ? value.trim() : null);

export async function registerCustomer(
  input: z.infer<typeof registerSchema>,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date; customer: PublicCustomer }> {
  const existing = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new AccountError("An account already uses that email address.", 409);
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

  const session = await startSession(customer.id, meta);
  return { ...session, customer };
}

export async function loginCustomer(
  input: z.infer<typeof loginSchema>,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date; customer: PublicCustomer }> {
  const row = await prisma.customer.findUnique({
    where: { email: input.email },
    select: { ...PUBLIC_FIELDS, passwordHash: true, archivedAt: true },
  });

  // Compare against a dummy hash when there is no such account, so a wrong
  // email and a wrong password take the same amount of time to fail.
  const hash = row?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const matches = await bcrypt.compare(input.password, hash);

  if (!row || row.archivedAt || !matches) {
    throw new AccountError("Those details do not match an account.", 401);
  }

  await prisma.customer.update({
    where: { id: row.id },
    data: { lastLoginAt: new Date() },
  });

  const { passwordHash: _hash, archivedAt: _archived, ...customer } = row;
  const session = await startSession(customer.id, meta);
  return { ...session, customer };
}

async function startSession(
  customerId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

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
      number: true,
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
    Number: order.number,
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
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
} as const;
