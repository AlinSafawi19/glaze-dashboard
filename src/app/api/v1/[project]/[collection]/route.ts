import type { NextRequest } from "next/server";

import { bearerFrom, verifyApiKey } from "@/lib/api-key";
import { corsHeaders, json } from "@/lib/cors";
import { COLLECTIONS, readCollection } from "@/lib/public-api";
import { parseCollectionQuery, validateForCollection } from "@/lib/public-api-query";
import { customerFromToken } from "@/lib/customer-auth";
import { announceOrder } from "@/lib/notify";
import { CheckoutError, checkoutSchema, placeOrder } from "@/lib/orders";
import { clearCart } from "@/lib/saved-lists";

export const dynamic = "force-dynamic";

/** Kept in the URL so the storefront's existing paths resolve unchanged. */
const PROJECT = "glaze";

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ project: string; collection: string }> }
) {
  const { project, collection } = await ctx.params;

  const denied = await authorise(request, project);
  if (denied) return denied;

  const spec = COLLECTIONS[collection];
  if (!spec) {
    return json(request, { error: "Collection not found" }, { status: 404 });
  }

  // Orders are inbound-only: they hold customer addresses and phone numbers, so
  // a storefront key must never be able to read them back.
  if (collection === "orders") {
    return json(request, { error: "Orders are write-only over this API" }, { status: 403 });
  }

  // A bad filter is answered rather than ignored: a caller that mistypes
  // `?brnad=` should be told, not handed the unfiltered catalogue as if it had
  // asked for it.
  const parsed = parseCollectionQuery(request.nextUrl.searchParams);
  if (parsed.error) {
    return json(request, { error: parsed.error.message }, { status: 400 });
  }

  const unsupported = validateForCollection(collection, parsed.query);
  if (unsupported) {
    return json(request, { error: unsupported.message }, { status: 400 });
  }

  const { page, limit } = parsed.query;

  try {
    const result = await readCollection(collection, parsed.query);
    if (!result) {
      return json(request, { error: "Collection not found" }, { status: 404 });
    }

    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    return json(request, {
      collection: { name: spec.name, slug: spec.slug, fields: spec.fields },
      data: result.data,
      pagination: {
        total: result.total,
        page,
        limit,
        totalPages,
        // Saves the caller recomputing it, and says plainly whether another
        // request is worth making.
        hasMore: page < totalPages,
      },
      ...(result.facets ? { facets: result.facets } : {}),
    });
  } catch (error) {
    console.error("[api/v1 GET]", error);
    return json(request, { error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ project: string; collection: string }> }
) {
  const { project, collection } = await ctx.params;

  const denied = await authorise(request, project);
  if (denied) return denied;

  if (collection !== "orders") {
    return json(request, { error: "This collection is read-only" }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      request,
      { error: "Invalid order", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    // Optional: guests check out without one. The token is verified here rather
    // than trusting any customer id in the body.
    const customer = await customerFromToken(request.headers.get("X-Customer-Token"));
    const order = await placeOrder(
      parsed.data,
      customer?.id ?? null,
      customer?.email ?? null
    );

    // The basket has been bought; do not hand it back on the next visit.
    if (customer) await clearCart(customer.id);

    // Best-effort, and awaited so a serverless instance is not frozen mid-send.
    // Failures are swallowed inside — the order is already committed, and a
    // shopper must never see an error because an email provider was down.
    await announceOrder({
      id: order.id,
      reference: order.reference,
      name: order.name,
      phone: order.phone,
      address: order.address,
      city: order.city,
      notes: order.notes,
      payment: order.payment,
      email: order.email,
      total: String(Number(order.total)),
      items: order.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unitPrice: String(Number(item.unitPrice)),
      })),
    });
    return json(
      request,
      {
        data: {
          id: order.id,
          Reference: order.reference,
          Total: String(Number(order.total)),
          Created: order.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      return json(request, { error: error.message }, { status: 422 });
    }
    console.error("[api/v1 POST orders]", error);
    return json(request, { error: "Internal server error" }, { status: 500 });
  }
}

/** Returns a response to send back on failure, or null when the caller is good. */
async function authorise(request: NextRequest, project: string): Promise<Response | null> {
  if (request.nextUrl.searchParams.has("key")) {
    return json(
      request,
      { error: "API key in URL is not supported. Use Authorization: Bearer <key>." },
      { status: 400 }
    );
  }

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
