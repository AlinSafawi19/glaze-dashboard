import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/dal";
import { MAX_UPLOAD_BYTES, storageConfigured, uploadImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Where the image pickers in the dashboard send a file.
 *
 * Staff-only and cookie-authenticated, like /api/notifications and unlike
 * /api/v1: the storefront has no business writing to the bucket, and the bucket
 * credentials never leave the server, so there is no presigned-PUT to leak.
 *
 * The answer is the URL to store on the row, which the form drops straight into
 * its hidden field — so the product action keeps taking a URL and knows nothing
 * about buckets.
 */

/** The only prefixes an upload may be filed under. */
const FOLDERS = new Set(["products"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  if (!storageConfigured()) {
    return Response.json(
      { error: "Image storage is not configured on this server." },
      { status: 503 }
    );
  }

  // Cheap refusal before the body is read: the browser announces the length,
  // and reading 400MB to then reject it helps nobody.
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES * 1.1) {
    return Response.json({ error: "That image is too large." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was sent." }, { status: 400 });
  }

  const folder = String(form.get("folder") ?? "products");
  if (!FOLDERS.has(folder)) {
    return Response.json({ error: "Unknown upload folder." }, { status: 400 });
  }

  let outcome;
  try {
    outcome = await uploadImage(file, folder);
  } catch (error) {
    console.error("[upload]", error);
    return Response.json({ error: "The upload failed. Please try again." }, { status: 502 });
  }

  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 400 });

  return Response.json(outcome.result, { status: 201 });
}
