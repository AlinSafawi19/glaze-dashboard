"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DatePicker from "react-datepicker";
import { CalendarDays } from "lucide-react";

import { Loader } from "@/components/loader";
import { cx } from "@/components/ui";

/**
 * Drives the range-filtered half of the overview through `?from=&to=`.
 *
 * Presets cover the questions actually asked day to day; the calendar is there
 * for anything else. It is one control rather than two date fields: a range is
 * a single idea, and picking both ends on one calendar makes "the fortnight
 * either side of the sale" a two-click job.
 *
 * react-datepicker rather than native inputs — the native calendar cannot show
 * a range at all, and its look is whatever the browser decides, which is the
 * one thing on this page that would not be ours.
 */

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const iso = (date: Date) => {
  // Local parts, not toISOString: at 2am in Beirut the UTC date is still
  // yesterday, and "today" must mean the day the shop is having.
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** `2026-08-21` → a Date at local midnight, or null. */
function parse(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - (n - 1));
  return iso(date);
}

export function DateRangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [start, setStart] = useState<Date | null>(parse(from));
  const [end, setEnd] = useState<Date | null>(parse(to));

  // Keep in step when the range changes from a preset or the back button.
  useEffect(() => setStart(parse(from)), [from]);
  useEffect(() => setEnd(parse(to)), [to]);

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
          <span className="label-sm text-brown">Range</span>
          <div className="relative">
            <CalendarDays
              size={14}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brown"
            />
            <DatePicker
              selectsRange
              startDate={start ?? undefined}
              endDate={end ?? undefined}
              maxDate={new Date()}
              dateFormat="dd MMM yyyy"
              monthsShown={2}
              showPopperArrow={false}
              // The overview sits inside scrolling panels; the calendar belongs
              // over them, not clipped by one.
              portalId="date-range-portal"
              calendarClassName="glaze-calendar"
              placeholderText="Pick two dates"
              className="w-[230px] rounded-none border border-beige bg-white py-1.5 pl-8 pr-2.5 font-inter text-[13px] font-light text-black focus:border-black focus:outline-none"
              onChange={(dates) => {
                const [nextStart, nextEnd] = dates as [Date | null, Date | null];
                setStart(nextStart);
                setEnd(nextEnd);
                // Only when both ends are known — a half-picked range would
                // reload the page against yesterday's other end.
                if (nextStart && nextEnd) apply(iso(nextStart), iso(nextEnd));
              }}
            />
          </div>
        </label>

        {pending && <Loader size={16} label="Loading range" className="mb-2" />}
      </div>
    </div>
  );
}
