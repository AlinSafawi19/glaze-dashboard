"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";

import { cx } from "@/components/ui";

/**
 * Three ways to render a value that is worth doing something with.
 *
 * A phone number, an email address, an order reference — the dashboard is full
 * of strings that staff either act on or paste somewhere else, and until now
 * each one was plain text that had to be selected by hand. These three cover
 * the cases: act on it, take a copy of it, or both.
 *
 * They are deliberately quiet. The copy control is invisible until the row is
 * hovered or the control is focused, so a table of forty numbers does not turn
 * into a table of forty buttons.
 */

/** Guesses the right scheme so callers can pass a bare number or address. */
function inferHref(value: string, href?: string): string {
  if (href) return href;
  if (value.includes("@") && !value.includes(" ")) return `mailto:${value}`;
  if (/^[+()\d][\d\s()+-]{5,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`;
  return value;
}

const LINK_CLASS =
  "text-black underline-offset-4 transition-colors hover:text-plum hover:underline";

export interface ClickableTextProps {
  /** The text shown, and what the href is inferred from. */
  value: string;
  /** Overrides the inferred href — an internal path, say. */
  href?: string;
  /** Opens in a new tab. External http(s) links default to true. */
  newTab?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Text that goes somewhere: a route, an address, a number to ring. Internal
 * paths route through `next/link`; everything else is a plain anchor, because
 * `mailto:` and `tel:` are the browser's business, not the router's.
 */
export function ClickableText({
  value,
  href,
  newTab,
  className,
  children,
}: ClickableTextProps) {
  const target = inferHref(value, href);
  const label = children ?? value;

  if (target.startsWith("/")) {
    return (
      <Link href={target} className={cx(LINK_CLASS, className)}>
        {label}
      </Link>
    );
  }

  const external = /^https?:/i.test(target);
  const opensAway = newTab ?? external;

  return (
    <a
      href={target}
      className={cx(LINK_CLASS, className)}
      {...(opensAway ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {label}
    </a>
  );
}

/** The shared copy button, and the "copied" state that flashes after it. */
function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Insecure origins and older browsers have no clipboard API; the old
        // hidden-textarea trick still works there.
        const scratch = document.createElement("textarea");
        scratch.value = value;
        scratch.setAttribute("readonly", "");
        scratch.style.position = "fixed";
        scratch.style.opacity = "0";
        document.body.appendChild(scratch);
        scratch.select();
        document.execCommand("copy");
        document.body.removeChild(scratch);
      }

      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused — the text is still there to select by hand */
    }
  }, [value]);

  return { copied, copy };
}

function CopyButton({
  value,
  label,
  copied,
  onCopy,
}: {
  value: string;
  label: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // Inside a clickable row or beside a link: copying is the whole action.
        event.preventDefault();
        event.stopPropagation();
        onCopy();
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${value}`}
      className={cx(
        "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center align-middle",
        "text-brown opacity-0 transition-opacity duration-200",
        "group-hover/copy:opacity-100 focus-visible:opacity-100 hover:text-black",
        copied && "opacity-100 text-success"
      )}
    >
      {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
    </button>
  );
}

export interface CopyableTextProps {
  /** Shown, and copied. Pass `copyValue` when the two differ. */
  value: string;
  /** What lands on the clipboard, if not the visible text. */
  copyValue?: string;
  /** Named in the button's label: "Copy phone number". */
  label?: string;
  className?: string;
  children?: React.ReactNode;
}

/** Text with a copy control beside it. */
export function CopyableText({
  value,
  copyValue,
  label = "value",
  className,
  children,
}: CopyableTextProps) {
  const { copied, copy } = useCopy(copyValue ?? value);

  return (
    <span className={cx("group/copy inline-flex items-center gap-1.5", className)}>
      <span>{children ?? value}</span>
      <CopyButton value={copyValue ?? value} label={label} copied={copied} onCopy={copy} />
      {/* Announced to a screen reader, which cannot see the icon change. */}
      <span className="sr-only" role="status">
        {copied ? `${label} copied` : ""}
      </span>
    </span>
  );
}

export type ClickableCopyableTextProps = ClickableTextProps & {
  copyValue?: string;
  label?: string;
};

/**
 * Both: the text acts, and the icon beside it takes a copy. This is what most
 * phone numbers and email addresses in the dashboard want — ring them, or paste
 * them into the courier's form.
 */
export function ClickableCopyableText({
  value,
  href,
  newTab,
  copyValue,
  label = "value",
  className,
  children,
}: ClickableCopyableTextProps) {
  const { copied, copy } = useCopy(copyValue ?? value);

  return (
    <span className={cx("group/copy inline-flex items-center gap-1.5", className)}>
      <ClickableText value={value} href={href} newTab={newTab}>
        {children ?? value}
      </ClickableText>
      <CopyButton value={copyValue ?? value} label={label} copied={copied} onCopy={copy} />
      <span className="sr-only" role="status">
        {copied ? `${label} copied` : ""}
      </span>
    </span>
  );
}
