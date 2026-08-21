import type { NextRequest } from "next/server";

import { bearerFrom, verifyApiKey } from "@/lib/api-key";
import { corsHeaders, json } from "@/lib/cors";
import {
  AccountError,
  UnverifiedEmailError,
  customerFromToken,
  customerOrders,
  forgotPasswordSchema,
  loginCustomer,
  loginSchema,
  profileSchema,
  registerCustomer,
  registerSchema,
  resendSchema,
  resendVerification,
  requestPasswordReset,
  resetCustomerPassword,
  resetPasswordSchema,
  revokeSession,
  updateProfile,
  verifyCustomerEmail,
  verifySchema,
} from "@/lib/customer-auth";
import {
  cartSchema,
  readCart,
  readWishlist,
  wishlistSchema,
  writeCart,
  writeWishlist,
} from "@/lib/saved-lists";

export const dynamic = "force-dynamic";

const PROJECT = "glaze";

/**
 * Customer account endpoints.
 *
 * Two credentials are in play and they do different jobs: the bearer API key
 * says "this is the Glaze storefront", and `X-Customer-Token` says "and this is
 * the shopper it is acting for". The key alone never grants access to anyone's
 * account, so a leaked key cannot read order history.
 *
 * The storefront calls these from its own server, keeping the token in an
 * httpOnly cookie the browser cannot read.
 */

const CUSTOMER_TOKEN_HEADER = "X-Customer-Token";

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      "Access-Control-Allow-Headers": `Authorization, Content-Type, ${CUSTOMER_TOKEN_HEADER}`,
    },
  });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ project: string; action: string }> }
) {
  const { project, action } = await ctx.params;

  const denied = await authorise(request, project);
  if (denied) return denied;

  let body: unknown = {};
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const meta = {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  };

  try {
    switch (action) {
      /**
       * Registering does not sign anyone in any more: it creates the account
       * and emails a code. The storefront should send the shopper to its code
       * screen and post it back to `verify`, which is what returns a session.
       */
      case "register": {
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: parsed.error.issues[0].message }, { status: 400 });
        }
        const result = await registerCustomer(parsed.data);
        return json(request, result, { status: 201 });
      }

      case "verify": {
        const parsed = verifySchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: "Enter the six-digit code we emailed you." }, { status: 400 });
        }
        return json(request, await verifyCustomerEmail(parsed.data, meta));
      }

      case "resend-code": {
        const parsed = resendSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: parsed.error.issues[0].message }, { status: 400 });
        }
        await resendVerification(parsed.data.email);
        // Deliberately the same answer whether or not there was an account to
        // send to, so this cannot be used to test addresses.
        return json(request, { ok: true }, { status: 202 });
      }

      case "login": {
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: "Enter your email and password." }, { status: 400 });
        }
        const result = await loginCustomer(parsed.data, meta);
        return json(request, result);
      }

      case "forgot-password": {
        const parsed = forgotPasswordSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: parsed.error.issues[0].message }, { status: 400 });
        }
        await requestPasswordReset(parsed.data.email);
        return json(request, { ok: true }, { status: 202 });
      }

      case "reset-password": {
        const parsed = resetPasswordSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: parsed.error.issues[0].message }, { status: 400 });
        }
        await resetCustomerPassword(parsed.data);
        // Every session was revoked; the shopper signs in with the new password.
        return json(request, { ok: true });
      }

      case "logout": {
        await revokeSession(request.headers.get(CUSTOMER_TOKEN_HEADER));
        return json(request, { ok: true });
      }

      case "profile": {
        const customer = await requireCustomer(request);
        const parsed = profileSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: parsed.error.issues[0].message }, { status: 400 });
        }
        return json(request, { customer: await updateProfile(customer.id, parsed.data) });
      }

      // Both lists are replaced wholesale — the client holds the complete state.
      case "cart": {
        const customer = await requireCustomer(request);
        const parsed = cartSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: "Invalid cart" }, { status: 400 });
        }
        return json(request, { items: await writeCart(customer.id, parsed.data.items) });
      }

      case "wishlist": {
        const customer = await requireCustomer(request);
        const parsed = wishlistSchema.safeParse(body);
        if (!parsed.success) {
          return json(request, { error: "Invalid wishlist" }, { status: 400 });
        }
        return json(request, { slugs: await writeWishlist(customer.id, parsed.data.slugs) });
      }

      default:
        return json(request, { error: "Unknown account action" }, { status: 404 });
    }
  } catch (error) {
    return handle(request, error, `account/${action}`);
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ project: string; action: string }> }
) {
  const { project, action } = await ctx.params;

  const denied = await authorise(request, project);
  if (denied) return denied;

  try {
    const customer = await requireCustomer(request);

    switch (action) {
      case "me":
        return json(request, { customer });
      case "orders":
        return json(request, { customer, orders: await customerOrders(customer.id) });
      case "cart":
        return json(request, { items: await readCart(customer.id) });
      case "wishlist":
        return json(request, { slugs: await readWishlist(customer.id) });
      default:
        return json(request, { error: "Unknown account action" }, { status: 404 });
    }
  } catch (error) {
    return handle(request, error, `account/${action}`);
  }
}

async function requireCustomer(request: NextRequest) {
  const customer = await customerFromToken(request.headers.get(CUSTOMER_TOKEN_HEADER));
  if (!customer) throw new AccountError("Not signed in.", 401);
  return customer;
}

async function authorise(request: NextRequest, project: string): Promise<Response | null> {
  const raw = bearerFrom(request);
  if (!raw) return json(request, { error: "API key required" }, { status: 401 });
  if (!(await verifyApiKey(raw))) {
    return json(request, { error: "Invalid API key" }, { status: 401 });
  }
  if (project !== PROJECT) {
    return json(request, { error: "Project not found" }, { status: 404 });
  }
  return null;
}

function handle(request: NextRequest, error: unknown, label: string): Response {
  if (error instanceof UnverifiedEmailError) {
    // The flag is the point: the storefront opens its code screen rather than
    // showing this as a failed sign-in.
    return json(
      request,
      { error: error.message, verificationRequired: true },
      { status: error.status }
    );
  }
  if (error instanceof AccountError) {
    return json(request, { error: error.message }, { status: error.status });
  }
  console.error(`[api/v1 ${label}]`, error);
  return json(request, { error: "Internal server error" }, { status: 500 });
}
