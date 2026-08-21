"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

import { Loader } from "@/components/loader";
import { BrandAsyncSelect, type SelectOption } from "@/components/select";
import { Button, cx } from "@/components/ui";
import type { OptionSource } from "@/lib/options";

/**
 * The per-column filters above a list.
 *
 * Each one writes a search parameter and the page re-queries, so filtering
 * happens in the database against the whole table — not against the twenty-five
 * rows that happen to be on screen. Changing any of them drops `page`/`show`,
 * because page 4 of the old result set means nothing in the new one.
 *
 * Below `desktop` the row is behind a toggle. The controls are the same ones,
 * not a cut-down set: a phone has less room, not less need to find a thing.
 */

export interface FilterSpec {
  /** The search parameter this control owns. */
  param: string;
  label: string;
  placeholder?: string;
  /** Fixed choices, when the list is short and known. */
  options?: SelectOption[];
  /** Look choices up in the database as the reader types. */
  source?: OptionSource;
  /** Whatever is currently selected, and its label — resolved on the server. */
  value?: string | null;
  valueLabel?: string | null;
}

export function Filters({ filters }: { filters: FilterSpec[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const active = filters.filter((filter) => filter.value).length;

  function apply(param: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(param, value);
    else params.delete(param);

    // A filter change invalidates wherever we were in the old result set.
    params.delete("page");
    params.delete("show");

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams);
    for (const filter of filters) params.delete(filter.param);
    params.delete("page");
    params.delete("show");

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  if (filters.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 desktop:hidden">
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          <SlidersHorizontal size={14} strokeWidth={1.5} />
          Filters
          {active > 0 && (
            <span className="bg-plum px-1.5 py-0.5 font-clash text-[11px] font-medium text-white">
              {active}
            </span>
          )}
        </Button>
        {active > 0 && (
          <Button type="button" variant="ghost" className="px-2 py-1.5" onClick={clearAll}>
            <X size={14} strokeWidth={1.5} />
            Clear
          </Button>
        )}
        {pending && <Loader size={14} label="Filtering" />}
      </div>

      <div
        className={cx(
          "gap-3 desktop:mt-0 desktop:grid",
          open ? "mt-3 grid" : "hidden",
          // Two or three abreast on a wide screen; one per line on a phone.
          filters.length >= 3
            ? "desktop:grid-cols-4"
            : "desktop:grid-cols-2"
        )}
      >
        {filters.map((filter) => (
          <label key={filter.param} className="flex flex-col gap-1">
            <span className="label-sm text-brown">{filter.label}</span>
            <BrandAsyncSelect
              // Not a form field — the URL is where this value lives.
              name={`filter-${filter.param}`}
              source={filter.source}
              options={
                filter.options ??
                (filter.value && filter.valueLabel
                  ? [{ value: filter.value, label: filter.valueLabel }]
                  : [])
              }
              defaultValue={filter.value ?? undefined}
              placeholder={filter.placeholder ?? `Any ${filter.label.toLowerCase()}`}
              onChange={(value) => apply(filter.param, value)}
            />
          </label>
        ))}
      </div>

      {/* The desktop row has no toggle to hang "Clear all" off, so it sits under. */}
      {active > 0 && (
        <div className="mt-2 hidden items-center gap-3 desktop:flex">
          <button
            type="button"
            onClick={clearAll}
            className="cursor-pointer label-sm text-brown underline-offset-4 hover:text-black hover:underline"
          >
            Clear {active === 1 ? "filter" : `all ${active} filters`}
          </button>
          {pending && <Loader size={14} label="Filtering" />}
        </div>
      )}
    </div>
  );
}
