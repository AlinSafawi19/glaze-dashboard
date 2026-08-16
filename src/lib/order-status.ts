import type { OrderStatus } from "@prisma/client";

/**
 * Kept out of the actions module: a "use server" file may only export async
 * functions, and these constants are needed by client components too.
 */

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const STATUS_TONE: Record<OrderStatus, "neutral" | "success" | "warn" | "danger"> = {
  PENDING: "warn",
  CONFIRMED: "neutral",
  SHIPPED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
};
