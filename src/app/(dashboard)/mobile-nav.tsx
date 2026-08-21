"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cx } from "@/components/ui";

/**
 * The sidebar, as a drawer, for screens too narrow to keep it open.
 *
 * It takes the navigation as children rather than building its own: the links
 * are rendered once on the server and handed to both this and the desktop
 * sidebar, so there is no second copy of the menu to fall out of step.
 *
 * Behaves like `Modal` — Escape closes it, the backdrop closes it, the page
 * behind it stops scrolling — with the addition that following a link closes
 * it too, since the drawer would otherwise sit over the page it just opened.
 */
export function MobileNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Separate from `open` so the panel can start off-screen and be moved in on
  // the next frame; mounting it already in place would skip the transition.
  const [shown, setShown] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }

    const frame = requestAnimationFrame(() => setShown(true));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="-ml-1.5 cursor-pointer rounded-none p-1.5 text-brown transition-colors hover:bg-dusty hover:text-black desktop:hidden"
      >
        <Menu size={18} strokeWidth={1.5} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 desktop:hidden">
            <div
              className={cx(
                "absolute inset-0 bg-blush/60 backdrop-blur-[2px] transition-opacity duration-300",
                shown ? "opacity-100" : "opacity-0"
              )}
              aria-hidden
              onClick={close}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className={cx(
                "absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col overflow-y-auto",
                "border-r border-beige bg-lavender",
                "transition-transform duration-300 [transition-timing-function:cubic-bezier(0.44,0,0.56,1)]",
                shown ? "translate-x-0" : "-translate-x-full"
              )}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="absolute right-3 top-4 cursor-pointer rounded-none p-1.5 text-brown transition-colors hover:bg-dusty hover:text-black"
              >
                <X size={18} strokeWidth={1.5} />
              </button>

              {children}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
