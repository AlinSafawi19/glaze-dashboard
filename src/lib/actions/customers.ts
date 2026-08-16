"use server";

import { revalidatePath } from "next/cache";

import { requireOwner, requireUserForAction } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

function refresh(id?: string) {
  revalidatePath("/customers");
  if (id) revalidatePath(`/customers/${id}`);
}

/**
 * Archiving blocks sign-in. Every live session is revoked in the same
 * transaction, so an already-signed-in shopper is locked out immediately rather
 * than staying in until their token happens to expire.
 */
export async function archiveCustomer(id: string): Promise<void> {
  await requireUserForAction();

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!customer) throw new Error("That customer no longer exists.");
  if (customer.archivedAt) return;

  await prisma.$transaction([
    prisma.customer.update({ where: { id }, data: { archivedAt: new Date() } }),
    prisma.customerSession.updateMany({
      where: { customerId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  refresh(id);
}

export async function restoreCustomer(id: string): Promise<void> {
  await requireUserForAction();

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!customer) throw new Error("That customer no longer exists.");
  if (!customer.archivedAt) return;

  // Sessions stay revoked — restoring lets them sign in again, it does not put
  // them back into a session that was cut off.
  await prisma.customer.update({ where: { id }, data: { archivedAt: null } });
  refresh(id);
}

/**
 * Permanent. Owners only, and only once archived. Their orders survive: the
 * customer link is nulled, and each order keeps its own copy of the name,
 * phone and address it was delivered to.
 */
export async function deleteCustomer(id: string): Promise<void> {
  await requireOwner();

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  if (!customer?.archivedAt) throw new Error("Archive it first.");

  await prisma.customer.delete({ where: { id } });
  refresh();
}
