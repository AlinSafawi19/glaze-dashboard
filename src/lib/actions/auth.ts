"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { requireUserForAction } from "@/lib/dal";

export interface AuthState {
  error?: string;
  ok?: boolean;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export async function login(_state: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, archivedAt: true, name: true, role: true },
  });

  // Hash-compare even when there is no such user, so a wrong email and a wrong
  // password take the same amount of time to fail.
  const hash = user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const matches = await bcrypt.compare(parsed.data.password, hash);

  if (!user || user.archivedAt || !matches) {
    return { error: "Those details do not match an account." };
  }

  const headerList = await headers();
  await createSession(user.id, {
    ipAddress: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
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

  await prisma.user.update({
    where: { id: user.id },
    data: { email: parsed.data.email },
  });

  revalidatePath("/settings");

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
