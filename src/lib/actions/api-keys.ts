"use server";

import { revalidatePath } from "next/cache";

import { generateApiKey } from "@/lib/api-key";
import { requireOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export interface KeyState {
  error?: string;
  /** Shown once, immediately after minting — never retrievable again. */
  created?: string;
}

export async function createApiKey(
  _state: KeyState,
  formData: FormData
): Promise<KeyState> {
  await requireOwner();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the key a name so you can tell them apart." };

  const months = Number.parseInt(String(formData.get("months") ?? "12"), 10);
  const expiresAt =
    Number.isFinite(months) && months > 0
      ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000)
      : null;

  const { raw, hash, prefix } = generateApiKey();

  await prisma.apiKey.create({
    data: { name: name.slice(0, 120), keyHash: hash, keyPrefix: prefix, expiresAt },
  });

  revalidatePath("/settings");

  return { created: raw };
}

export async function revokeApiKey(id: string): Promise<void> {
  await requireOwner();

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/settings");
}
