import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";

import { SESSION_COOKIE, userFromSessionToken } from "@/lib/session";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * The single place a request turns into a user. Every server action, page and
 * admin route handler goes through here rather than trusting the cookie, so a
 * revoked or expired session stops working on the next request.
 *
 * `cache` dedupes it across one render pass — a page and three of its
 * components asking for the user costs one query.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  return userFromSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
});

/** Use in pages and layouts: bounces to the login screen when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Use in server actions: throws rather than redirecting mid-mutation. */
export async function requireUserForAction(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  return user;
}

export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUserForAction();
  if (user.role !== "OWNER") throw new Error("Owners only.");
  return user;
}

