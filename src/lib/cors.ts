/**
 * The storefront calls /api/v1 from the browser with a bearer key, so every
 * response needs CORS headers. Allowed origins come from STOREFRONT_ORIGINS
 * rather than a blanket `*`, so a leaked key cannot be used from any page.
 */

function allowList(): string[] {
  return (process.env.STOREFRONT_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = allowList();

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Customer-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && allowed.includes(origin.replace(/\/$/, ""))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function json(
  request: Request,
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { ...corsHeaders(request), ...init.headers },
  });
}
