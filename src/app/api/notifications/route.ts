import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * The notification inbox, polled by the bell in the dashboard chrome.
 *
 * Staff-only and cookie-authenticated — unlike /api/v1, which is the
 * storefront's bearer-key surface. It answers with JSON 401 rather than the
 * proxy's redirect, because the caller here is fetch, not a browser navigation.
 */

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "12", 10) || 12)
  );

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);

  return Response.json({
    unread,
    items: items.map((item) => ({
      ...item,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  });
}

/** Marks one notification read, or all of them when no id is given. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : null;

  await prisma.notification.updateMany({
    where: { readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });

  return Response.json({ ok: true });
}
