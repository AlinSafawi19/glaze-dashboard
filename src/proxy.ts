import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, readCookieClaims } from "@/lib/session";

/**
 * Optimistic gate only — it reads the cookie signature and nothing else, so a
 * prefetch never costs a database round trip. Real authorisation happens in the
 * data access layer (`src/lib/dal.ts`), which every page and action goes
 * through.
 *
 * Because this check is weaker than the real one, it only ever redirects in the
 * direction the two layers agree on: a missing or unreadable cookie means
 * definitely signed out. It deliberately does *not* send a cookie-holder on to
 * the dashboard — a signature stays valid after its session row is revoked,
 * expired or dropped, and a proxy that trusted it would fight the data access
 * layer's redirect back to /login and loop the browser between the two.
 * Sending an already-signed-in visitor to the dashboard is the login page's
 * job, where the session can actually be verified.
 */
const PUBLIC_PAGES = ["/login", "/forgot-password", "/verify-email"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes answer their own auth with a JSON 401. Redirecting them here
  // would hand `fetch` a login page with a 200 on it, which is worse than a
  // refusal it can actually branch on.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Everything a signed-out person legitimately needs: signing in, and the two
  // screens that exist precisely because they cannot.
  if (PUBLIC_PAGES.includes(pathname)) return NextResponse.next();

  const claims = await readCookieClaims(request.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  const response = NextResponse.redirect(new URL("/login", request.nextUrl));
  // Drop the dead cookie on the way out so it stops being sent.
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
