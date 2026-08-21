import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/dal";
import { isOptionSource, loadOptions } from "@/lib/options";

export const dynamic = "force-dynamic";

/**
 * Feeds the searchable selects. Staff-only and cookie-authenticated, like the
 * rest of the dashboard's own endpoints — the catalogue is public through
 * /api/v1, but the shape of the admin's dropdowns is not.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const source = request.nextUrl.searchParams.get("source") ?? "";
  if (!isOptionSource(source)) {
    return Response.json({ error: "Unknown option source" }, { status: 400 });
  }

  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);

  try {
    return Response.json({ options: await loadOptions(source, query) });
  } catch (error) {
    console.error("[options]", source, error);
    return Response.json({ error: "Could not load options" }, { status: 500 });
  }
}
