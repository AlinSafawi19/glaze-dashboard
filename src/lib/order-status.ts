import type { OrderStatus } from "@prisma/client";

/**
 * Kept out of the actions module: a "use server" file may only export async
 * functions, and these constants are needed by client components too.
 */

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "CANCELLED",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, "neutral" | "success" | "warn" | "danger"> = {
  PENDING: "warn",
  CONFIRMED: "neutral",
  // Shipped is the finish line now, so it reads as one.
  SHIPPED: "success",
  CANCELLED: "danger",
};

/**
 * Where an order may go from where it is.
 *
 * An order moves forward or it is called off; it never goes back. Once it has
 * shipped, "confirmed" is not a thing that can become true again — and shipping
 * is as far as the line goes, because handing the box to the courier is where
 * the shop's part ends.
 *
 * Cancelling stays available after that, because a courier can come back with
 * the box. A shipped order leaves the dashboard's open queue by being archived,
 * not by moving on again.
 */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["CANCELLED"],
  CANCELLED: [],
};

export function canMoveTo(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUSES[from].includes(to);
}

/** The button that moves an order one step along, per status. */
export const ADVANCE_LABEL: Record<OrderStatus, string> = {
  PENDING: "Mark pending",
  CONFIRMED: "Confirm order",
  SHIPPED: "Mark shipped",
  CANCELLED: "Cancel order",
};
