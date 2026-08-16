import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "glaze_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): Uint8Array {
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

/**
 * The cookie carries a signed JWT, but the row in `Session` is what actually
 * authorises a request — so revoking a session takes effect immediately rather
 * than whenever the token happens to expire.
 */
export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
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
    .sign(secret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Signature-only check. Cheap enough for the proxy; not proof of authority. */
export async function readCookieClaims(
  token: string | undefined
): Promise<(SessionClaims & { t: string }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
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
