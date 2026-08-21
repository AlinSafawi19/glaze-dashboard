"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The app's only dialog shell. Portals to the body, traps focus loosely by
 * moving focus in on open, closes on Escape and on a backdrop click, and locks
 * the page behind it — the same behaviour the storefront's filter sheet has.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Blush rather than plum: the dialog only has to be lifted off the page,
          not the page hidden behind it. A slight blur does the separating that
          a heavy wash used to, so the overlay can stay pale. */}
      <div
        className="absolute inset-0 bg-blush/60 backdrop-blur-[2px]"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex w-full ${width} max-h-[85vh] flex-col gap-4 overflow-y-auto border border-beige bg-white p-6 outline-none`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] leading-[1.3] text-black">{title}</h2>
            {description && (
              <p className="mt-1.5 font-inter text-[14px] font-light text-brown">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-brown transition-colors hover:text-black"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {children}

        {footer && <div className="flex flex-wrap justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
