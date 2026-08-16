"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Loader } from "@/components/loader";
import { cx } from "@/components/ui";

/**
 * Drives the range-filtered half of the overview through `?from=&to=`.
 *
 * Presets cover the questions actually asked day to day; the two date fields
 * are there for anything else. Native date inputs are used deliberately — they
 * bring the platform's own calendar, keyboard handling and locale formatting,
 * which no hand-rolled popover matches.
 */

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const iso = (date: Date) => date.toISOString().slice(0, 10);

function daysAgo(n: number): string {
  return iso(new Date(Date.now() - (n - 1) * 86_400_000));
}

export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);

  // Keep in step when the range changes from a preset or the back button.
  useEffect(() => setLocalFrom(from), [from]);
  useEffect(() => setLocalTo(to), [to]);

  const today = iso(new Date());

  function apply(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams);
    params.set("from", nextFrom);
    params.set("to", nextTo);
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  }

  const activePreset = PRESETS.find(
    (preset) => from === daysAgo(preset.days) && to === today
  );

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex items-center gap-1">
        {PRESETS.map((preset) => {
          const active = activePreset?.days === preset.days;
          return (
            <button
              key={preset.days}
              type="button"
              onClick={() => apply(daysAgo(preset.days), today)}
              className={cx(
                "cursor-pointer border px-2.5 py-1.5 label-sm transition-colors",
                active
                  ? "border-black bg-black text-accent"
                  : "border-beige text-brown hover:border-black hover:text-black"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="label-sm text-brown">From</span>
          <input
            type="date"
            value={localFrom}
            max={localTo}
            onChange={(event) => {
              setLocalFrom(event.target.value);
              if (event.target.value) apply(event.target.value, localTo);
            }}
            className="rounded-none border border-beige bg-white px-2.5 py-1.5 font-inter text-[13px] font-light text-black focus:border-black focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label-sm text-brown">To</span>
          <input
            type="date"
            value={localTo}
            min={localFrom}
            max={today}
            onChange={(event) => {
              setLocalTo(event.target.value);
              if (event.target.value) apply(localFrom, event.target.value);
            }}
            className="rounded-none border border-beige bg-white px-2.5 py-1.5 font-inter text-[13px] font-light text-black focus:border-black focus:outline-none"
          />
        </label>

        {pending && <Loader size={16} label="Loading range" className="mb-2" />}
      </div>
    </div>
  );
}
