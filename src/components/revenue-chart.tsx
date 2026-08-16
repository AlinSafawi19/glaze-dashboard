"use client";

import { useMemo, useState } from "react";

import { cx } from "@/components/ui";

/**
 * Revenue per day across the selected range.
 *
 * One series, so there is no legend — the heading names it — and one hue does
 * the work. Plum sits at 8.1:1 on white, well past the 3:1 floor for marks;
 * the pale brand tints measure under 2:1 and are used only for the grid and
 * hover ground, never to carry data.
 *
 * Built from plain elements rather than a chart library: the whole thing is a
 * row of columns, which keeps the marks, the 2px gaps and the rounded tops
 * exactly as specified and adds no dependency.
 */

export interface DayPoint {
  day: string;
  orders: number;
  revenue: number;
}

const money = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const FULL_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

/** Rounds the axis top to something a person would choose. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

export function RevenueChart({ points }: { points: DayPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const max = useMemo(
    () => niceMax(Math.max(...points.map((p) => p.revenue), 0)),
    [points]
  );

  const total = points.reduce((sum, p) => sum + p.revenue, 0);

  // Enough labels to orient, few enough not to collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  if (points.length === 0) {
    return (
      <p className="py-12 text-center font-inter text-[14px] font-light italic text-brown">
        No days in this range.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-sm text-brown">Revenue in range</p>
          <p className="mt-1 font-clash text-[28px] leading-[1.2] tabular-nums">
            {money(total)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="cursor-pointer label-sm text-brown underline-offset-4 hover:text-black hover:underline"
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        // The table is the accessible equivalent of the plot, not a fallback.
        <div className="max-h-[280px] overflow-y-auto border border-beige">
          <table className="w-full border-collapse font-inter text-[13px] font-light">
            <thead className="sticky top-0 bg-warm">
              <tr>
                <th className="border-b border-beige px-3 py-2 text-left label-sm text-brown">
                  Day
                </th>
                <th className="border-b border-beige px-3 py-2 text-right label-sm text-brown">
                  Orders
                </th>
                <th className="border-b border-beige px-3 py-2 text-right label-sm text-brown">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.day}>
                  <td className="border-b border-dusty px-3 py-1.5">
                    {DAY.format(new Date(point.day))}
                  </td>
                  <td className="border-b border-dusty px-3 py-1.5 text-right tabular-nums">
                    {point.orders}
                  </td>
                  <td className="border-b border-dusty px-3 py-1.5 text-right tabular-nums">
                    {money(point.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          {/* Grid — recessive, behind the marks, labelled on the left. */}
          <div className="relative h-[220px] pl-12">
            {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
              <div
                key={fraction}
                className="absolute inset-x-0 left-12 flex items-center"
                style={{ top: `${(1 - fraction) * 100}%` }}
              >
                <span className="absolute -left-12 w-10 text-right font-inter text-[11px] font-light text-brown tabular-nums">
                  {money(max * fraction)}
                </span>
                <span
                  className={cx(
                    "h-px w-full",
                    fraction === 0 ? "bg-beige" : "bg-dusty"
                  )}
                />
              </div>
            ))}

            {/* Marks. `gap-[2px]` is the surface gap between adjacent bars. */}
            <div className="absolute inset-0 left-12 flex items-end gap-[2px]">
              {points.map((point, index) => {
                const height = max > 0 ? (point.revenue / max) * 100 : 0;
                const active = hovered === index;

                return (
                  <div
                    key={point.day}
                    className="group relative flex h-full flex-1 cursor-default items-end"
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                    tabIndex={0}
                    role="img"
                    aria-label={`${FULL_DAY.format(new Date(point.day))}: ${money(point.revenue)} from ${point.orders} ${point.orders === 1 ? "order" : "orders"}`}
                  >
                    {/* Hover ground — a wider hit target than the mark itself. */}
                    <span
                      aria-hidden
                      className={cx(
                        "absolute inset-0 transition-colors",
                        active ? "bg-dusty/60" : "bg-transparent"
                      )}
                    />
                    {/* Capped and centred: over a short range the columns
                        would otherwise be ~70px slabs, and the spec calls for
                        thin marks. The hover ground stays full width, so the
                        hit target does not shrink with the mark. */}
                    <span
                      aria-hidden
                      className={cx(
                        "relative mx-auto w-full max-w-[34px] rounded-t-[4px] transition-colors",
                        active ? "bg-brown" : "bg-plum"
                      )}
                      style={{ height: `${height}%`, minHeight: point.revenue > 0 ? 2 : 0 }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X axis — every nth day, so labels never collide. */}
          <div className="mt-2 flex gap-[2px] pl-12">
            {points.map((point, index) => (
              <div key={point.day} className="min-w-0 flex-1 text-center">
                {index % labelEvery === 0 && (
                  <span className="font-inter text-[11px] font-light text-brown">
                    {DAY.format(new Date(point.day))}
                  </span>
                )}
              </div>
            ))}
          </div>

          {hovered !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 w-max border border-beige bg-white px-3 py-2 shadow-[0_4px_16px_rgba(74,43,57,0.14)]"
              style={{
                left: `calc(3rem + ${((hovered + 0.5) / points.length) * 100}% - 3rem * ${(hovered + 0.5) / points.length})`,
                transform: "translateX(-50%)",
              }}
            >
              <p className="label-sm text-brown">
                {FULL_DAY.format(new Date(points[hovered].day))}
              </p>
              <p className="mt-1 font-clash text-[16px] tabular-nums">
                {money(points[hovered].revenue)}
              </p>
              <p className="font-inter text-[12px] font-light text-brown">
                {points[hovered].orders}{" "}
                {points[hovered].orders === 1 ? "order" : "orders"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
