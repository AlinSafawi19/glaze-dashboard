"use client";

import { useTransition } from "react";
import { Minus, Plus } from "lucide-react";

import { Badge } from "@/components/ui";
import { adjustStock } from "@/lib/actions/products";
import { STOCK_LABEL, STOCK_TONE, stockState } from "@/lib/stock";

/**
 * Stock on a product card, with the two buttons that move it.
 *
 * Restocking is the shop's most repeated action, so it happens here rather than
 * only in the editor. The server owns the arithmetic — these buttons post a
 * delta, never a total — so two people working the same shelf cannot overwrite
 * one another's count.
 */
export function StockControl({ id, stock }: { id: string; stock: number | null }) {
  const [pending, startTransition] = useTransition();
  const state = stockState(stock);

  // Nothing to step when the shop does not count this product.
  if (stock === null) {
    return (
      <span className="font-inter text-[13px] text-brown">{STOCK_LABEL.untracked}</span>
    );
  }

  const nudge = (delta: number) =>
    startTransition(async () => {
      try {
        await adjustStock(id, delta);
      } catch {
        // The page revalidates on success; a refusal just leaves the count as
        // it was, which is what the reader is already looking at.
      }
    });

  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center border border-dashed border-beige">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={pending || stock <= 0}
          aria-label="One fewer in stock"
          className="flex h-6 w-6 items-center justify-center border-none bg-transparent text-brown enabled:cursor-pointer disabled:opacity-40"
        >
          <Minus size={12} strokeWidth={1.5} />
        </button>

        <span className="min-w-[28px] text-center font-clash text-[13px] tabular-nums text-black">
          {stock}
        </span>

        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={pending}
          aria-label="One more in stock"
          className="flex h-6 w-6 items-center justify-center border-none bg-transparent text-brown enabled:cursor-pointer disabled:opacity-40"
        >
          <Plus size={12} strokeWidth={1.5} />
        </button>
      </span>

      {state !== "in" && <Badge tone={STOCK_TONE[state]}>{STOCK_LABEL[state]}</Badge>}
    </span>
  );
}
