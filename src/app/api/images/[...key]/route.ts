import type { NextRequest } from "next/server";

import { isServableKey, keyFromPath, readImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded image back out of the private bucket.
 *
 * Deliberately unauthenticated: these are product photos, rendered by the
 * storefront to anonymous shoppers, and by the dashboard's own <img> tags —
 * neither of which can sign an S3 request. The bucket stays private and this
 * route is the only door, which is why it will only read keys under the
 * `images/` prefix.
 *
 * Presigned URLs were the alternative and are the wrong shape: the URL is
 * stored on the product row and read months later, so it has to keep working
 * long after any signature would have expired.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key: segments } = await params;
  const key = keyFromPath(segments);

  if (!isServableKey(key)) return new Response("Not found", { status: 404 });

  let object;
  try {
    object = await readImage(key);
  } catch (error) {
    console.error("[image]", key, error);
    return new Response("Upstream error", { status: 502 });
  }

  if (!object) return new Response("Not found", { status: 404 });

  // Keys are unique per upload, so a hit is always the same bytes.
  const headers = new Headers({
    "Content-Type": object.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    // The bytes were type-checked on the way in; belt and braces on the way
    // out, so a stored file can never be talked into running as a document on
    // this origin.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  });
  if (object.etag) headers.set("ETag", object.etag);
  if (object.contentLength !== undefined) {
    headers.set("Content-Length", String(object.contentLength));
  }

  if (object.etag && request.headers.get("if-none-match") === object.etag) {
    // The body has to be drained, or the socket to the bucket stays open.
    void object.body.cancel();
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
}
