import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

/**
 * Shared primitives, cut from the storefront's design language: square corners
 * (`rounded-none` everywhere), Clash Display for anything label-shaped, Inter
 * for prose, and the same brand palette.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-none px-4 py-2.5 label-sm cursor-pointer " +
  "transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum";

const VARIANTS = {
  // Mirrors the storefront's FilledButton: black ground, accent-pink label.
  primary: "bg-black text-accent hover:text-beige",
  // Mirrors OutlineButton at rest, inverting to black on hover.
  secondary: "border border-beige bg-transparent text-black hover:bg-black hover:text-accent",
  ghost: "text-brown hover:bg-dusty hover:text-black",
  danger: "border border-error/40 bg-danger-soft text-error hover:bg-error hover:text-white",
  /**
   * Table row actions. Edit, archive, restore and delete all sit together in
   * one cell, so none of them carries a border or a fill — only the delete
   * colour sets it apart. Padding is trimmed so they read as a row of links.
   */
  row: "px-1.5 py-1 text-brown hover:text-black underline-offset-4 hover:underline",
  rowDanger: "px-1.5 py-1 text-error hover:text-error underline-offset-4 hover:underline",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(BUTTON_BASE, VARIANTS[variant], className)} {...props} />;
}

export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(BUTTON_BASE, VARIANTS[variant], className)} {...props} />;
}

/**
 * Cancel is a retreat, not a choice of equal weight — so it reads as a quiet
 * dashed outline rather than competing with the solid submit button beside it.
 */
const CANCEL_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-none border border-dashed border-beige " +
  "px-4 py-2.5 label-sm text-brown cursor-pointer bg-transparent " +
  "transition-colors duration-300 hover:border-solid hover:border-black hover:text-black " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum";

export function CancelButton({ className, ...props }: ComponentProps<"button">) {
  return <button className={cx(CANCEL_CLASS, className)} {...props} />;
}

export function CancelLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cx(CANCEL_CLASS, className)} {...props} />;
}

export const INPUT_CLASS =
  "w-full rounded-none border border-beige bg-white px-3 py-2 font-inter text-[14px] font-light " +
  "text-black placeholder:text-brown/50 focus:border-black focus:outline-none disabled:opacity-60 " +
  "[transition:border-color_0.3s_cubic-bezier(0.44,0,0.56,1)]";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="label-sm text-brown">{label}</span>
      {children}
      {hint && !error && (
        <span className="font-inter text-[12px] font-light italic text-brown">{hint}</span>
      )}
      {error && <span className="font-inter text-[12px] text-error">{error}</span>}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-none border border-beige bg-white", className)} {...props} />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  /** Usually a line of text, but a page may hand it something to click. */
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-beige pb-5">
      <div>
        <h1 className="text-[28px] leading-[1.2] text-black tablet:text-[32px]">{title}</h1>
        {subtitle && (
          <div className="mt-1.5 font-inter text-[14px] font-light italic text-brown">
            {subtitle}
          </div>
        )}
      </div>
      {action}
    </header>
  );
}

const TONES = {
  neutral: "bg-dusty text-brown",
  success: "bg-success-soft text-success",
  warn: "bg-blush text-plum",
  danger: "bg-danger-soft text-error",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cx("inline-flex items-center rounded-none px-2 py-1 label-sm", TONES[tone])}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** For a panel that has to fill the height of the one beside it. */
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center gap-3 border border-dashed border-beige bg-dusty px-6 py-14 text-center",
        className
      )}
    >
      <p className="label-sm text-black">{title}</p>
      {description && (
        <p className="max-w-sm font-inter text-[14px] font-light italic text-brown [text-wrap:balance]">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export function Table({
  children,
  minWidth = 640,
  className,
}: {
  children: ReactNode;
  /**
   * Below this the table scrolls sideways rather than crushing its columns.
   * Narrow it for tables that sit two-to-a-row, where 640 would clip a column
   * out of sight instead of wrapping it.
   */
  minWidth?: number;
  /** For a table that has to fill the height of the panel beside it. */
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto border border-beige bg-white", className)}>
      <table
        className="w-full border-collapse font-inter text-[14px] font-light"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cx(
        "border-b border-beige bg-warm px-4 py-2.5 text-left label-sm text-brown",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cx("border-b border-dusty px-4 py-3 align-middle text-black", className)}
      {...props}
    />
  );
}
