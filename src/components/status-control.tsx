"use client";

import type { OrderStatus } from "@prisma/client";
import { Check } from "lucide-react";

import { ActionButton } from "@/components/confirm-button";
import { Badge, cx } from "@/components/ui";
import { setOrderStatus } from "@/lib/actions/orders";
import {
  ADVANCE_LABEL,
  NEXT_STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/lib/order-status";

/** The happy path, in order. Cancelling steps off it rather than along it. */
const PIPELINE: OrderStatus[] = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];

/**
 * What the dialog says before each move.
 *
 * Every step is confirmed, not just the final ones. Most of these are not a
 * private note on a record — they email the shopper — and a mis-click on a
 * busy list should not be the thing that tells someone their order shipped.
 * The two that send nothing are confirmed anyway, because a step that cannot
 * be walked back deserves the same pause as one that cannot be unsent.
 *
 * Each one says whether an email goes out, since that is the part that cannot
 * be taken back.
 */
const CONFIRM: Record<
  OrderStatus,
  { title: string; body: string; label: string }
> = {
  PENDING: {
    title: "Move this order back to pending?",
    body: "The shopper is not emailed about this step.",
    label: "Mark pending",
  },
  CONFIRMED: {
    title: "Confirm this order?",
    body: "The shopper is emailed that their order is confirmed and being put together, and that you will be in touch when it goes out.",
    label: "Confirm order",
  },
  SHIPPED: {
    title: "Mark this order shipped?",
    body: "The shopper is emailed that their order is on its way, with the delivery address and the amount to have ready for the courier.",
    label: "Mark shipped",
  },
  DELIVERED: {
    title: "Mark this order delivered?",
    body: "Delivered is the end of the line — the order cannot be moved again afterwards. The shopper is not emailed about this step.",
    label: "Mark delivered",
  },
  CANCELLED: {
    title: "Cancel this order?",
    body: "The shopper is emailed that their order is cancelled and there is nothing to pay. A cancelled order cannot be reopened.",
    label: "Cancel order",
  },
};

/**
 * Moving an order along.
 *
 * This replaced a dropdown listing every status, which had two problems: it
 * offered moves that make no sense — a shipped order going back to pending —
 * and it asked the reader to know the sequence. Buttons for the one or two
 * moves actually available say what happens next, and nothing else is
 * offered, so the order of steps is the control rather than a rule to learn.
 *
 * Most moves email the shopper, so these are not silent — which is why every
 * one of them asks first.
 */
export function StatusControl({
  id,
  status,
  variant = "row",
}: {
  id: string;
  status: OrderStatus;
  /** `row` for the list; `full` adds the pipeline, for one order's own page. */
  variant?: "row" | "full";
}) {
  const next = NEXT_STATUSES[status];
  const done = next.length === 0;

  const buttons = next.map((target) => {
    const cancelling = target === "CANCELLED";
    const copy = CONFIRM[target];

    return (
      <ActionButton
        key={target}
        action={setOrderStatus.bind(null, id, target)}
        label={ADVANCE_LABEL[target]}
        pendingLabel="Saving"
        variant={
          cancelling
            ? variant === "full"
              ? "danger"
              : "rowDanger"
            : variant === "full"
              ? "primary"
              : "row"
        }
        confirm={copy.body}
        confirmTitle={copy.title}
        confirmLabel={copy.label}
      />
    );
  });

  if (variant === "row") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        {buttons}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Pipeline status={status} />
      {done ? (
        <p className="font-inter text-[13px] font-light italic text-brown">
          {status === "CANCELLED"
            ? "This order was cancelled. Nothing further to do."
            : "This order is complete. Nothing further to do."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">{buttons}</div>
      )}
    </div>
  );
}

/**
 * Where the order is on the line from placed to delivered. A cancelled order
 * has left the line, so it shows as its own state rather than being drawn
 * somewhere along it.
 */
function Pipeline({ status }: { status: OrderStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="danger">Cancelled</Badge>
        <span className="font-inter text-[13px] font-light text-brown">
          stopped before delivery
        </span>
      </div>
    );
  }

  const current = PIPELINE.indexOf(status);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {PIPELINE.map((step, i) => {
        const passed = i < current;
        const here = i === current;

        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={cx(
                "inline-flex items-center gap-1.5 px-2 py-1 label-sm",
                here && "bg-black text-accent",
                passed && "text-brown",
                !here && !passed && "text-beige"
              )}
            >
              {passed && <Check size={12} strokeWidth={2} />}
              {STATUS_LABEL[step]}
            </span>
            {i < PIPELINE.length - 1 && (
              <span
                aria-hidden
                className={cx("h-px w-5", i < current ? "bg-brown" : "bg-beige")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
