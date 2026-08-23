/**
 * Stock, as the rest of the app talks about it.
 *
 * `null` is a real state, not a missing value: it means the shop does not
 * count this product. Those never read as sold out and never block a checkout,
 * which is what lets stock tracking be switched on one product at a time.
 */

/** At or below this many units, the dashboard flags a product as running low. */
export const LOW_STOCK_AT = 3;

export type StockState = "untracked" | "out" | "low" | "in";

export function stockState(stock: number | null | undefined): StockState {
  if (stock === null || stock === undefined) return "untracked";
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_AT) return "low";
  return "in";
}

/** Whether a shopper can still buy this at all. */
export function inStock(stock: number | null | undefined): boolean {
  return stockState(stock) !== "out";
}

/**
 * The most a shopper may put in the basket. Untracked products keep the cart's
 * own ceiling rather than becoming unbuyable.
 */
export const CART_MAX = 999;

export function maxOrderable(stock: number | null | undefined): number {
  return stock === null || stock === undefined ? CART_MAX : Math.max(0, stock);
}

export const STOCK_LABEL: Record<StockState, string> = {
  untracked: "Not tracked",
  out: "Out of stock",
  low: "Low stock",
  in: "In stock",
};

export const STOCK_TONE: Record<StockState, "neutral" | "success" | "warn" | "danger"> = {
  untracked: "neutral",
  out: "danger",
  low: "warn",
  in: "success",
};
