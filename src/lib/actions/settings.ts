"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/dal";
import { STORE_SETTINGS_ID } from "@/lib/delivery";
import { prisma } from "@/lib/prisma";

export interface DeliveryFeeState {
  error?: string;
  /** The fee as saved, to confirm what took effect. */
  saved?: string;
}

/** A ceiling against a slipped digit, not a business rule. */
const MAX_FEE = 1000;

export async function updateDeliveryFee(
  _state: DeliveryFeeState,
  formData: FormData
): Promise<DeliveryFeeState> {
  await requireOwner();

  const raw = String(formData.get("deliveryFee") ?? "").trim();
  const fee = Number(raw);
  if (raw === "" || !Number.isFinite(fee) || fee < 0) {
    return { error: "Enter the fee as a number, 0 or more." };
  }
  if (fee > MAX_FEE) return { error: `That is over ${MAX_FEE} — check the amount.` };

  const deliveryFee = fee.toFixed(2);

  await prisma.storeSettings.upsert({
    where: { id: STORE_SETTINGS_ID },
    create: { id: STORE_SETTINGS_ID, deliveryFee },
    update: { deliveryFee },
  });

  revalidatePath("/settings");

  return { saved: String(Number(deliveryFee)) };
}
