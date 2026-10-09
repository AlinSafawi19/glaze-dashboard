import type { NextRequest } from "next/server";

import { bearerFrom, verifyApiKey } from "@/lib/api-key";
import { corsHeaders, json } from "@/lib/cors";
import { getDeliveryFee } from "@/lib/delivery";

export const dynamic = "force-dynamic";

const PROJECT = "glaze";

/**
 * Shop-wide values the storefront displays, edited from the dashboard's
 * Settings page. Today that is the delivery fee, so the cart shows the same
 * figure checkout charges.
 *
 * `{ data: { DeliveryFee: "4" } }` — a string, like every other number on this
 * API.
 */

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ project: string }> }
) {
  const { project } = await ctx.params;

  const raw = bearerFrom(request);
  if (!raw) return json(request, { error: "API key required" }, { status: 401 });
  if (!(await verifyApiKey(raw))) {
    return json(request, { error: "Invalid API key" }, { status: 401 });
  }
  if (project !== PROJECT) {
    return json(request, { error: "Project not found" }, { status: 404 });
  }

  try {
    const deliveryFee = await getDeliveryFee();
    return json(request, { data: { DeliveryFee: String(deliveryFee) } });
  } catch (error) {
    console.error("[api/v1 GET settings]", error);
    return json(request, { error: "Internal server error" }, { status: 500 });
  }
}
