import { createServer } from "node:http";
import { parse } from "node:url";

import next from "next";
import { Server as SocketServer } from "socket.io";

import { SESSION_COOKIE, userFromSessionToken } from "@/lib/session-token";
import { DASHBOARD_ROOM, setSocketServer } from "@/lib/realtime";

/**
 * The Glaze dashboard, served by Node rather than by `next start`.
 *
 * Next's own server has nowhere to hold a WebSocket open — a route handler
 * answers a request and ends — so the HTTP server is created here, Next is
 * mounted on it as the request handler, and socket.io shares the same port.
 * One process, one port, and server actions can reach the socket server through
 * `@/lib/realtime` because they run in this very process.
 *
 * Run it with `npm run dev` or `npm start`; both go through tsx.
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3002", 10);
// Not HOSTNAME: some shells set that to the machine name, which Next then
// prints as the dev URL.
const hostname = process.env.HOST ?? "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/** `a=1; b=2` → the value of one cookie. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  await app.prepare();

  const server = createServer((req, res) => {
    // `parse` keeps Next's own routing happy about the query object.
    handle(req, res, parse(req.url ?? "/", true)).catch((error: unknown) => {
      console.error("[server] request failed", error);
      res.statusCode = 500;
      res.end("Internal server error");
    });
  });

  const io = new SocketServer(server, {
    path: "/socket.io",
    // Same origin as the dashboard itself; the storefront has no business here.
    cors: { origin: false },
    serveClient: false,
  });

  /**
   * A socket is authorised exactly like a page: the session cookie the browser
   * sends with the handshake has to name a live session for a live user. The
   * cookie is httpOnly, so this is not something a script on the page can fake.
   */
  io.use((socket, next_) => {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);

    userFromSessionToken(token)
      .then((user) => {
        if (!user) {
          next_(new Error("Not signed in"));
          return;
        }
        socket.data.userId = user.id;
        next_();
      })
      .catch((error: unknown) => {
        console.error("[socket] could not authorise handshake", error);
        next_(new Error("Could not authorise"));
      });
  });

  io.on("connection", (socket) => {
    // One room for the whole shop: staff share a notification inbox, so
    // everyone signed in sees the same arrivals.
    void socket.join(DASHBOARD_ROOM);

    socket.on("disconnect", (reason) => {
      if (dev) console.log(`[socket] ${socket.id} left (${reason})`);
    });
  });

  setSocketServer(io);

  server.listen(port, () => {
    console.log(`▲ Glaze dashboard on http://${hostname}:${port} (sockets on /socket.io)`);
  });
}

main().catch((error: unknown) => {
  console.error("[server] failed to start", error);
  process.exit(1);
});
