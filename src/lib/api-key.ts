import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

const PREFIX = "glz_";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Returned once, at mint time — only the hash survives in the database. */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = PREFIX + randomBytes(32).toString("hex");
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

export function bearerFrom(request: Request): string {
  return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

export interface VerifiedKey {
  id: string;
  name: string;
}

/**
 * Resolves a bearer token to a live key, or null. `lastUsedAt` is written
 * fire-and-forget so a slow write never delays the storefront's response.
 */
export async function verifyApiKey(rawKey: string): Promise<VerifiedKey | null> {
  if (!rawKey) return null;

  const key = await prisma.apiKey.findFirst({
    where: {
      keyHash: hashApiKey(rawKey),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, name: true },
  });

  if (!key) return null;

  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return key;
}
