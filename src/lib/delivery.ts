import "server-only";

import { prisma } from "@/lib/prisma";

/** The one `StoreSettings` row. */
export const STORE_SETTINGS_ID = "store";

/**
 * Flat delivery fee added to every order, in store currency.
 *
 * Read from the database on every checkout, so a change in Settings applies to
 * the next order without a deploy. The storefront displays the same value via
 * `/api/v1/glaze/settings`. Each order freezes the fee it was charged, so
 * changing this never touches old orders.
 */
export async function getDeliveryFee(): Promise<number> {
  // An upsert rather than a read: the migration seeds the row, but a database
  // built some other way (`db push`, a restore) still gets the default instead
  // of a checkout that fails on a missing row.
  const settings = await prisma.storeSettings.upsert({
    where: { id: STORE_SETTINGS_ID },
    create: { id: STORE_SETTINGS_ID },
    update: {},
    select: { deliveryFee: true },
  });
  return Number(settings.deliveryFee);
}
