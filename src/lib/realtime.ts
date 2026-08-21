import type { Server as SocketServer } from "socket.io";

/**
 * The dashboard's push channel.
 *
 * The socket server is created in `server.ts` — the custom Node server that
 * boots Next — and parked on `globalThis` so route handlers and server actions
 * running in that same process can reach it. Importing it the usual way is not
 * an option: Next compiles this module into its own bundle, which would give it
 * a second, empty socket server that nobody is connected to.
 *
 * Every function here is a no-op when the server is absent, so `next dev`
 * without the custom server still runs — the bell just falls back to polling.
 *
 * No `server-only` marker, unlike its neighbours: `server.ts` runs outside
 * Next's bundler, where that import does not resolve. Nothing secret passes
 * through here, only the notification payload the bell already fetches.
 */

const KEY = "__glazeSocketServer";

type Global = typeof globalThis & { [KEY]?: SocketServer };

/** The room every signed-in dashboard tab joins. */
export const DASHBOARD_ROOM = "dashboard";

export function setSocketServer(io: SocketServer): void {
  (globalThis as Global)[KEY] = io;
}

export function getSocketServer(): SocketServer | null {
  return (globalThis as Global)[KEY] ?? null;
}

export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Pushes a new notification to every open dashboard.
 *
 * Fire-and-forget on purpose: the row is already in the database and the bell
 * polls as a backstop, so a socket that is not there must not fail a checkout.
 */
export function pushNotification(notification: LiveNotification): void {
  try {
    getSocketServer()?.to(DASHBOARD_ROOM).emit("notification", notification);
  } catch (error) {
    console.error("[realtime] could not push notification", error);
  }
}

/** Tells open dashboards that an order changed, so lists and counts refresh. */
export function pushOrderChanged(orderId: string, status: string): void {
  try {
    getSocketServer()?.to(DASHBOARD_ROOM).emit("order:changed", { id: orderId, status });
  } catch (error) {
    console.error("[realtime] could not push order change", error);
  }
}
