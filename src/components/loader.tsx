import { cx } from "@/components/ui";

/**
 * The one spinner in the app. It is the storefront's: a ring of the border
 * colour with a single brown arc, spun. Every loading state — route
 * transitions, pending buttons, suspense fallbacks — uses this so waiting
 * always looks the same.
 */
export function Loader({
  size = 40,
  className,
  label = "Loading",
}: {
  size?: number;
  className?: string;
  /** Announced to screen readers; the ring itself is decorative. */
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx("inline-block animate-spin rounded-full border-beige", className)}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 20)),
        borderStyle: "solid",
        borderTopColor: "var(--color-brown)",
      }}
    />
  );
}

/** Centred in whatever space is available — for page and section fallbacks. */
export function LoaderScreen({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div className={cx("flex w-full items-center justify-center py-16", className)}>
      <Loader size={size} />
    </div>
  );
}
