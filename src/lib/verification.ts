import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { CodePurpose } from "@prisma/client";

import { emailConfigured } from "@/lib/email/send";
import { prisma } from "@/lib/prisma";

/**
 * Six-digit codes, for proving an email address and for resetting a password —
 * on both sides of the app.
 *
 * A code is stored the way a session token is: hashed, so a leaked database
 * hands nobody a working one. It lasts fifteen minutes, works once, and burns
 * after five wrong guesses, which is what keeps a six-digit secret worth having.
 *
 * A link would spare the typing, but a code can be read off a phone and typed
 * into a laptop, and it never leaks through a referrer or a mail scanner that
 * follows every URL it sees.
 */

export const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
/** How long before the same address may ask for another code. */
const RESEND_COOLDOWN_MS = 60_000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Six digits, uniformly random — `Math.random` has no business here. */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface CodeOwner {
  email: string;
  purpose: CodePurpose;
  /** Whichever side of the app this belongs to; never both. */
  userId?: string | null;
  customerId?: string | null;
}

export class TooSoonError extends Error {
  constructor() {
    super("A code was sent moments ago. Check your inbox, then try again.");
  }
}

/**
 * Issues a code, retiring any earlier one for the same address and purpose so
 * only the newest email works. Returns the raw code — the only time it exists
 * outside the email.
 */
export async function issueCode(owner: CodeOwner): Promise<string> {
  const recent = await prisma.verificationCode.findFirst({
    where: {
      email: owner.email,
      purpose: owner.purpose,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  if (recent) throw new TooSoonError();

  const code = newCode();

  await prisma.$transaction([
    // Retire the old ones rather than delete them: consumed rows are the audit
    // trail of what was sent.
    prisma.verificationCode.updateMany({
      where: { email: owner.email, purpose: owner.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationCode.create({
      data: {
        email: owner.email,
        purpose: owner.purpose,
        codeHash: hashCode(code),
        userId: owner.userId ?? null,
        customerId: owner.customerId ?? null,
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    }),
  ]);

  if (!emailConfigured()) {
    // Local development without Resend: the code still has to reach a human,
    // and the alternative is a flow nobody can walk through. Configured
    // installs never take this branch, so a real code never hits a log.
    console.warn(`[verification] ${owner.purpose} code for ${owner.email}: ${code}`);
  }

  return code;
}

export type CodeCheck =
  | { ok: true; userId: string | null; customerId: string | null }
  | { ok: false; error: string };

/**
 * Checks a code and, if it is right, spends it.
 *
 * Every failure answers the same way — no "that code expired" versus "that code
 * is wrong" — because the difference only helps someone guessing.
 */
export async function checkCode(
  email: string,
  purpose: CodePurpose,
  code: string
): Promise<CodeCheck> {
  const wrong = { ok: false as const, error: "That code is not right, or it has expired." };
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return wrong;

  const record = await prisma.verificationCode.findFirst({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true, userId: true, customerId: true },
  });
  if (!record) return wrong;

  if (record.attempts + 1 >= MAX_ATTEMPTS) {
    // This guess is the last one either way: right, it is spent below; wrong,
    // the code dies here rather than standing while someone works through the
    // remaining possibilities.
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 }, consumedAt: new Date() },
    });
    if (!matches(digits, record.codeHash)) return wrong;
  } else if (!matches(digits, record.codeHash)) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return wrong;
  } else {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }

  return { ok: true, userId: record.userId, customerId: record.customerId };
}

function matches(code: string, hash: string): boolean {
  const a = Buffer.from(hashCode(code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Housekeeping for anything long dead; safe to call whenever. */
export async function purgeExpiredCodes(): Promise<number> {
  const { count } = await prisma.verificationCode.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return count;
}
