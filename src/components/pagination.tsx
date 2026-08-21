"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Loader } from "@/components/loader";
import { PAGE_SIZE, pageCount } from "@/lib/pagination";
import { Button, cx } from "@/components/ui";

/**
 * Numbered pages from `desktop` up, "Load more" below it.
 *
 * Both write to the URL rather than holding rows in state, so the server does
 * the paging and a link to page 4 is a link to page 4. Whichever control is
 * used clears the other's parameter — see `@/lib/pagination`.
 */

/** `1 … 4 5 6 … 20` — never more than seven slots, however long the list. */
function pageSlots(current: number, last: number): Array<number | "gap"> {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const slots = new Set<number>([1, last, current]);
  for (const n of [current - 1, current + 1]) {
    if (n > 1 && n < last) slots.add(n);
  }
  // Keep the row a steady width near the ends, where the window is one-sided.
  if (current <= 3) [2, 3, 4].forEach((n) => slots.add(n));
  if (current >= last - 2) [last - 3, last - 2, last - 1].forEach((n) => slots.add(n));

  const sorted = [...slots].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);

  const out: Array<number | "gap"> = [];
  let previous = 0;
  for (const n of sorted) {
    if (previous && n - previous > 1) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}

export function Pagination({
  total,
  page,
  shown,
  cumulative,
}: {
  /** Rows matching the current search and filters, across the whole table. */
  total: number;
  page: number;
  /** How many rows this render actually put on screen. */
  shown: number;
  cumulative: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const last = pageCount(total);
  const firstOnPage = cumulative ? 1 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = cumulative ? shown : firstOnPage + shown - 1;
  const more = lastOnPage < total;

  function go(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  // A single page with nothing hidden needs no controls at all.
  if (total <= PAGE_SIZE) {
    return total === 0 ? null : (
      <p className="mt-4 font-inter text-[12px] font-light italic text-brown">
        {total} {total === 1 ? "row" : "rows"}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="font-inter text-[12px] font-light italic text-brown">
        Showing {firstOnPage}–{Math.min(lastOnPage, total)} of {total}
      </p>

      {/* Below desktop: one button that lengthens the list. */}
      <div className="desktop:hidden">
        {more && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => go({ show: String(lastOnPage + PAGE_SIZE), page: null })}
          >
            {pending ? (
              <>
                <Loader size={14} />
                Loading…
              </>
            ) : (
              `Load ${Math.min(PAGE_SIZE, total - lastOnPage)} more`
            )}
          </Button>
        )}
      </div>

      {/* From desktop up: numbered pages. */}
      <nav
        aria-label="Pagination"
        className="hidden items-center gap-1 desktop:flex"
      >
        <PagerButton
          disabled={page <= 1 || pending}
          onClick={() => go({ page: String(page - 1), show: null })}
          label="Previous page"
        >
          <ChevronLeft size={15} strokeWidth={1.5} />
        </PagerButton>

        {pageSlots(cumulative ? 1 : page, last).map((slot, i) =>
          slot === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-brown">
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              disabled={pending}
              aria-current={!cumulative && slot === page ? "page" : undefined}
              onClick={() => go({ page: String(slot), show: null })}
              className={cx(
                "min-w-8 cursor-pointer border px-2 py-1.5 label-sm transition-colors disabled:cursor-not-allowed",
                !cumulative && slot === page
                  ? "border-black bg-black text-accent"
                  : "border-beige text-brown hover:border-black hover:text-black"
              )}
            >
              {slot}
            </button>
          )
        )}

        <PagerButton
          disabled={(!cumulative && page >= last) || pending}
          onClick={() => go({ page: String((cumulative ? 1 : page) + 1), show: null })}
          label="Next page"
        >
          <ChevronRight size={15} strokeWidth={1.5} />
        </PagerButton>

        {pending && <Loader size={14} label="Loading page" className="ml-1" />}
      </nav>
    </div>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="cursor-pointer border border-beige px-2 py-1.5 text-brown transition-colors hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-beige disabled:hover:text-brown"
    >
      {children}
    </button>
  );
}
