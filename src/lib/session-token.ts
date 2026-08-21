import { createHash } from "node:crypto";
import { jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Reading a session cookie: signature, session row, expiry, archive state.
 *
 * Deliberately free of `server-only` and `next/headers` so the custom server in
 * `server.ts` can authorise a socket handshake with the very same rules a page
 * is authorised by. Writing sessions — which needs the cookie jar — lives in
 * `@/lib/session`, which re-exports everything here.
 */

export const SESSION_COOKIE = "glaze_session";

/**
 * Two lifetimes. Without "remember me" the cookie is a session cookie — it dies
 * with the browser — and the row behind it lasts a working day. With it, both
 * last a month, which is the point of ticking the box on your own machine.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const REMEMBERED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionSecret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. See .env.example."
    );
  }
  return new TextEncoder().encode(value);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionClaims {
  userId: string;
  sessionId: string;
}

/** Signature-only check. Cheap enough for the proxy; not proof of authority. */
export async function readCookieClaims(
  token: string | undefined
): Promise<(SessionClaims & { t: string }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string" || typeof payload.sessionId !== "string") {
      return null;
    }
    return {
      userId: payload.userId,
      sessionId: payload.sessionId,
      t: String(payload.t ?? ""),
    };
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * A raw cookie value turned into the user it authorises, or null. Revoking a
 * session therefore takes effect on the next request — or the next handshake.
 */
export async function userFromSessionToken(
  token: string | undefined
): Promise<SessionUser | null> {
  const claims = await readCookieClaims(token);
  if (!claims) return null;

  const session = await prisma.session.findFirst({
    where: {
      id: claims.sessionId,
      tokenHash: hashToken(claims.t),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      user: { select: { id: true, email: true, name: true, role: true, archivedAt: true } },
    },
  });

  if (!session?.user || session.user.archivedAt) return null;

  const { id, email, name, role } = session.user;
  return { id, email, name, role };
}
