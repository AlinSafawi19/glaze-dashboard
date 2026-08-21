"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { io, type Socket } from "socket.io-client";

import { cx } from "@/components/ui";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Arrivals come over the socket, so this is only a safety net: a dropped
 * connection, a socket server that is not running, a tab that slept. A minute
 * is often enough to notice something the push missed.
 */
const POLL_MS = 60_000;

/**
 * Plays a short two-note chime through the Web Audio API rather than shipping
 * an audio file — no asset to load, and it cannot fail to decode.
 *
 * Browsers block audio until the page has been interacted with, so the context
 * is created lazily on the first arrival and simply stays silent if the tab has
 * never been touched. The unread badge is the real signal; sound is a bonus.
 */
function useChime() {
  const ctx = useRef<AudioContext | null>(null);

  return useCallback(() => {
    try {
      type WithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
      if (!Ctor) return;

      ctx.current ??= new Ctor();
      const audio = ctx.current;
      if (audio.state === "suspended") void audio.resume();

      // Two soft sine tones, the second a fifth above — reads as a notification
      // rather than an alarm.
      [
        { freq: 880, at: 0 },
        { freq: 1318.5, at: 0.14 },
      ].forEach(({ freq, at }) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;

        const start = audio.currentTime + at;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);

        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    } catch {
      /* audio unavailable — the badge still updates */
    }
  }, []);
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const chime = useChime();

  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  // Tracks the newest id already seen, so the chime fires on genuinely new
  // arrivals rather than on every poll that happens to return unread rows.
  const newestSeen = useRef<string | null>(null);
  const primed = useRef(false);

  const panel = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items: Item[] };

      setItems(data.items);
      setUnread(data.unread);

      const newest = data.items[0]?.id ?? null;
      if (primed.current && newest && newest !== newestSeen.current) {
        chime();
        // A new order changes the sidebar's pending count and the orders list.
        router.refresh();
      }
      newestSeen.current = newest;
      primed.current = true;
    } catch {
      /* offline — the next tick tries again */
    }
  }, [chime, router]);

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, POLL_MS);

    // Coming back to the tab should feel current straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  /**
   * The live channel. The session cookie rides along with the handshake, so the
   * server can refuse a socket exactly as it would refuse a page; a refusal is
   * not worth surfacing, because polling carries on regardless.
   */
  useEffect(() => {
    const socket: Socket = io({ path: "/socket.io", withCredentials: true });

    socket.on("notification", (item: Item) => {
      setItems((list) =>
        list.some((existing) => existing.id === item.id)
          ? list
          : [item, ...list].slice(0, 12)
      );
      if (!item.readAt) setUnread((n) => n + 1);

      newestSeen.current = item.id;
      chime();
      // A new order changes the sidebar's pending count and the orders list.
      router.refresh();
    });

    // Somebody else moved an order along; lists and counts are now stale.
    socket.on("order:changed", () => router.refresh());

    // Whatever happened while the socket was down is caught by one poll.
    socket.on("connect", () => {
      if (primed.current) void poll();
    });

    return () => {
      socket.disconnect();
    };
  }, [chime, poll, router]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id?: string) {
    setUnread((n) => (id ? Math.max(0, n - 1) : 0));
    setItems((list) =>
      list.map((item) =>
        !id || item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
      )
    );
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    }).catch(() => undefined);
  }

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center text-brown transition-colors hover:text-black"
      >
        <Bell size={18} strokeWidth={1.5} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center bg-plum px-1 font-clash text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[320px] border border-beige bg-white shadow-[0_8px_24px_rgba(74,43,57,0.12)]">
          <div className="flex items-center justify-between border-b border-beige px-4 py-2.5">
            <span className="label-sm text-black">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead()}
                className="cursor-pointer label-sm text-brown underline-offset-4 hover:text-black hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center font-inter text-[14px] font-light italic text-brown">
                Nothing yet.
              </p>
            ) : (
              items.map((item) => {
                const content = (
                  <>
                    <div className="flex items-start gap-2">
                      {!item.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-plum" />
                      )}
                      <div className={cx("min-w-0 flex-1", item.readAt && "pl-3.5")}>
                        <p className="font-inter text-[14px] text-black">{item.title}</p>
                        {item.body && (
                          <p className="mt-0.5 font-inter text-[13px] font-light text-brown">
                            {item.body}
                          </p>
                        )}
                        <p className="mt-1 font-inter text-[12px] font-light text-brown">
                          {timeAgo(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </>
                );

                const className = cx(
                  "block w-full border-b border-dusty px-4 py-3 text-left transition-colors last:border-b-0",
                  item.readAt ? "bg-white hover:bg-caledon" : "bg-caledon hover:bg-dusty"
                );

                return item.href ? (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={className}
                    onClick={() => {
                      setOpen(false);
                      if (!item.readAt) void markRead(item.id);
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className={cx(className, "cursor-pointer")}
                    onClick={() => !item.readAt && markRead(item.id)}
                  >
                    {content}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
