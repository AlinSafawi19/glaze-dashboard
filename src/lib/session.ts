import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

import { prisma } from "@/lib/prisma";
import {
  REMEMBERED_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  hashToken,
  readCookieClaims,
  sessionSecret,
} from "@/lib/session-token";

/**
 * Writing sessions. Reading them is in `@/lib/session-token`, which the custom
 * server also uses to authorise socket handshakes; it is re-exported here so
 * the rest of the app has one place to import from.
 */

export {
  SESSION_COOKIE,
  hashToken,
  readCookieClaims,
  userFromSessionToken,
  type SessionClaims,
  type SessionUser,
} from "@/lib/session-token";

/**
 * The cookie carries a signed JWT, but the row in `Session` is what actually
 * authorises a request — so revoking a session takes effect immediately rather
 * than whenever the token happens to expire.
 */
export async function createSession(
  userId: string,
  meta: {
    ipAddress?: string | null;
    userAgent?: string | null;
    /** The "remember me" tick on the sign-in form. */
    remember?: boolean;
  } = {}
): Promise<void> {
  const remember = meta.remember ?? false;
  const expiresAt = new Date(Date.now() + (remember ? REMEMBERED_TTL_MS : SESSION_TTL_MS));
  const rawToken = randomBytes(32).toString("hex");

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      ipAddress: meta.ipAddress?.slice(0, 60) ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
    select: { id: true },
  });

  const jwt = await new SignJWT({ userId, sessionId: session.id, t: rawToken })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(sessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // No `expires` when not remembered: the cookie goes when the browser does,
    // which is what someone signing in on a shared machine expects.
    ...(remember ? { expires: expiresAt } : {}),
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const claims = await readCookieClaims(cookieStore.get(SESSION_COOKIE)?.value);

  if (claims) {
    await prisma.session
      .updateMany({
        where: { id: claims.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  cookieStore.delete(SESSION_COOKIE);
}
