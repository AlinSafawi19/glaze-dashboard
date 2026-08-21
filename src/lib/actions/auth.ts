"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { requireUserForAction } from "@/lib/dal";
import { sendEmail } from "@/lib/email/send";
import {
  passwordChanged,
  passwordResetCode,
  verificationCode as verificationCodeEmail,
} from "@/lib/email/templates";
import { CODE_TTL_MINUTES, TooSoonError, checkCode, issueCode } from "@/lib/verification";

export interface AuthState {
  error?: string;
  ok?: boolean;
  /** Set when sign-in stopped at an unproven address, so the form can offer the code screen. */
  verifyEmail?: string;
  /** Carries the address a code was just sent to, between the steps of a flow. */
  sentTo?: string;
}

async function sendStaffVerificationCode(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  const code = await issueCode({ email, purpose: "EMAIL_VERIFICATION", userId });
  await sendEmail(verificationCodeEmail({ name, code, minutes: CODE_TTL_MINUTES }, email));
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
  /** The checkbox is absent from the payload unless it is ticked. */
  remember: z.boolean(),
});

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") !== null,
  });

  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      passwordHash: true,
      archivedAt: true,
      name: true,
      role: true,
      emailVerifiedAt: true,
    },
  });

  // Hash-compare even when there is no such user, so a wrong email and a wrong
  // password take the same amount of time to fail.
  const hash = user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const matches = await bcrypt.compare(parsed.data.password, hash);

  if (!user || user.archivedAt || !matches) {
    return { error: "Those details do not match an account." };
  }

  // The password was right, so naming the real problem gives nothing away.
  if (!user.emailVerifiedAt) {
    await sendStaffVerificationCode(user.id, parsed.data.email, user.name).catch(
      (error: unknown) => {
        if (!(error instanceof TooSoonError)) throw error;
      }
    );
    return {
      error: "Confirm your email address first — we have sent you a code.",
      verifyEmail: parsed.data.email,
    };
  }

  const headerList = await headers();
  await createSession(user.id, {
    ipAddress: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
    remember: parsed.data.remember,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });


  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const emailSchema = z.object({
  email: z.email("That does not look like an email address.").trim().toLowerCase().max(255),
  password: z.string().min(1, "Confirm with your current password."),
});

/** Changing the sign-in address is re-authenticated, like a password change. */
export async function changeEmail(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const user = await requireUserForAction();

  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("currentPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.email === user.email) {
    return { error: "That is already your email address." };
  }

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!(await bcrypt.compare(parsed.data.password, row.passwordHash))) {
    return { error: "Your current password is not right." };
  }

  const taken = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (taken) return { error: "Another account already uses that email." };

  // The address does not move yet: a code goes to the new one, and
  // `confirmEmailChange` is what actually writes it. A typo therefore costs an
  // undelivered email rather than an account nobody can sign in to.
  try {
    await sendStaffVerificationCode(user.id, parsed.data.email, user.name);
  } catch (error) {
    if (error instanceof TooSoonError) return { error: error.message };
    throw error;
  }

  return { ok: true, sentTo: parsed.data.email };
}

/** Second half of the address change: the code came back, so make the move. */
export async function confirmEmailChange(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const user = await requireUserForAction();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");
  if (!email) return { error: "Start again — we do not know which address to confirm." };

  const check = await checkCode(email, "EMAIL_VERIFICATION", code);
  if (!check.ok) return { error: check.error };
  // A code issued for somebody else's account is not usable here.
  if (check.userId !== user.id) return { error: "That code is not right." };

  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken && taken.id !== user.id) {
    return { error: "Another account already uses that email." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { email, emailVerifiedAt: new Date() },
  });

  revalidatePath("/settings");

  return { ok: true };
}

/**
 * Confirms the address on an account that has never been verified — the case
 * sign-in bounces. Unauthenticated by necessity: the whole point is that this
 * person cannot get in yet, so the emailed code is the only credential.
 */
export async function verifyStaffEmail(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");

  const check = await checkCode(email, "EMAIL_VERIFICATION", code);
  if (!check.ok) return { error: check.error };
  if (!check.userId) return { error: "That code is not right." };

  await prisma.user.update({
    where: { id: check.userId },
    data: { emailVerifiedAt: new Date() },
  });

  return { ok: true };
}

const resetRequestSchema = z.object({
  email: z.email("That does not look like an email address.").trim().toLowerCase().max(255),
});

/**
 * Starts a staff password reset.
 *
 * Answers the same way whether or not the address has an account: a sign-in
 * page that tells you which addresses are real is a sign-in page that helps
 * someone build a list.
 */
export async function requestPasswordReset(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, archivedAt: true },
  });

  if (user && !user.archivedAt) {
    try {
      const code = await issueCode({
        email: parsed.data.email,
        purpose: "PASSWORD_RESET",
        userId: user.id,
      });
      await sendEmail(
        passwordResetCode({ name: user.name, code, minutes: CODE_TTL_MINUTES }, parsed.data.email)
      );
    } catch (error) {
      // Already sent one a moment ago — which is what they were told anyway.
      if (!(error instanceof TooSoonError)) throw error;
    }
  }

  return { ok: true, sentTo: parsed.data.email };
}

/**
 * Finishes it: new password, every session revoked, and an email saying so —
 * if the reset was not theirs, that email is how they find out.
 */
export async function resetPassword(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next !== confirm) return { error: "The two passwords do not match." };

  const strong = passwordSchema.safeParse(next);
  if (!strong.success) return { error: strong.error.issues[0].message };

  const check = await checkCode(email, "PASSWORD_RESET", code);
  if (!check.ok) return { error: check.error };
  if (!check.userId) return { error: "That code is not right." };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: check.userId },
      data: {
        passwordHash: await bcrypt.hash(next, 12),
        // Holding the code proves the address, for an account that never
        // confirmed it.
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.session.updateMany({
      where: { userId: check.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await sendEmail(passwordChanged(email, new Date()));

  return { ok: true };
}

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200)
  .regex(/[a-zA-Z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export async function changePassword(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const user = await requireUserForAction();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next !== confirm) return { error: "The two new passwords do not match." };

  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!(await bcrypt.compare(current, row.passwordHash))) {
    return { error: "Your current password is not right." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 12) },
  });

  // Every other device is signed out; this one keeps its session.

  return { ok: true };
}
