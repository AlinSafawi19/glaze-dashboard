import type { NextRequest } from "next/server";

import { csvResponse } from "@/lib/csv";
import { getCurrentUser } from "@/lib/dal";
import { exportCsv, sampleCsv, TRANSFERS, type TransferKey } from "@/lib/transfer";

export const dynamic = "force-dynamic";

/**
 * Downloads a collection as CSV — the whole thing, or `?sample=1` for a
 * one-row template showing the expected columns.
 *
 * Staff-only: an export is a full dump of the catalogue, so it is gated on the
 * dashboard session rather than the storefront's API key.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ resource: string }> }
) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { resource } = await ctx.params;
  const spec = TRANSFERS[resource as TransferKey];
  if (!spec) return Response.json({ error: "Unknown collection" }, { status: 404 });

  const wantsSample = request.nextUrl.searchParams.get("sample") === "1";

  if (wantsSample) {
    return csvResponse(`${resource}-sample.csv`, sampleCsv(spec.key));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return csvResponse(`${resource}-${stamp}.csv`, await exportCsv(spec.key));
}
