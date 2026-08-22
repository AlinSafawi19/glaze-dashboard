"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OrderStatus } from "@prisma/client";

import { Loader } from "@/components/loader";
import { BrandSelect } from "@/components/select";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";

const OPTIONS = ORDER_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }));

/**
 * Filters the list by status, from beside the search box.
 *
 * Same contract as the search input: the URL is where the value lives, so the
 * page re-queries against the whole table rather than the rows on screen, and
 * changing it drops `page`/`show` because page 4 of the old result set means
 * nothing in the new one.
 */
export function StatusFilter({
  value,
  counts,
}: {
  value: OrderStatus | null;
  /** How many orders sit in each status, appended to the option labels. */
  counts?: Partial<Record<OrderStatus, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const options = counts
    ? OPTIONS.map((option) => {
        const count = counts[option.value as OrderStatus] ?? 0;
        return count > 0 ? { ...option, label: `${option.label} (${count})` } : option;
      })
    : OPTIONS;

  function apply(next: string | null) {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("status", next);
    else params.delete("status");
    params.delete("page");
    params.delete("show");

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-full tablet:w-[190px]">
        <BrandSelect
          // Not a form field — the URL holds this value.
          name="filter-status"
          options={options}
          defaultValue={value ?? undefined}
          placeholder="Any status"
          onChange={apply}
        />
      </div>
      {pending && <Loader size={14} label="Filtering" />}
    </div>
  );
}
