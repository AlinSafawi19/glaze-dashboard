import "server-only";

import type { OrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Everything the overview screen reads.
 *
 * Two kinds of question live here and they are deliberately kept apart:
 *
 * - **Range questions** ("how did the last 15 days go?") take a date window.
 * - **Pipeline questions** ("what needs doing?") take none. An order placed
 *   two months ago and still unconfirmed is exactly the one that must not
 *   disappear because the window moved — so open work is never date-filtered.
 */

export const DEFAULT_RANGE_DAYS = 15;

export interface DateRange {
  from: Date;
  to: Date;
  /** Inclusive calendar days, for labelling. */
  days: number;
}

/** Local calendar day → the instant it starts, in UTC. */
function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfDay(value: Date): Date {
  const start = startOfDay(value);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function parseRange(from?: string, to?: string): DateRange {
  const today = new Date();

  const parsedTo = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : today;
  const parsedFrom =
    from && !Number.isNaN(Date.parse(from))
      ? new Date(from)
      : new Date(today.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);

  // A backwards range is a typo, not an empty result — swap rather than
  // silently showing nothing.
  const [lo, hi] =
    parsedFrom <= parsedTo ? [parsedFrom, parsedTo] : [parsedTo, parsedFrom];

  const start = startOfDay(lo);
  const end = endOfDay(hi);

  return {
    from: start,
    to: end,
    days: Math.round((startOfDay(hi).getTime() - start.getTime()) / 86_400_000) + 1,
  };
}

export const asInputDate = (value: Date): string => value.toISOString().slice(0, 10);

/** Orders that count toward money: live, not cancelled. */
const earning = (range: DateRange) => ({
  archivedAt: null,
  status: { not: "CANCELLED" as const },
  createdAt: { gte: range.from, lte: range.to },
});

export interface RangeStats {
  orders: number;
  revenue: number;
  units: number;
  averageOrder: number;
  newCustomers: number;
  cancelled: number;
}

export async function rangeStats(range: DateRange): Promise<RangeStats> {
  const window = { gte: range.from, lte: range.to };

  const [totals, units, newCustomers, cancelled] = await Promise.all([
    prisma.order.aggregate({
      where: earning(range),
      _count: true,
      _sum: { total: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: earning(range) },
      _sum: { quantity: true },
    }),
    prisma.customer.count({ where: { createdAt: window, archivedAt: null } }),
    prisma.order.count({
      where: { archivedAt: null, status: "CANCELLED", createdAt: window },
    }),
  ]);

  const orders = totals._count;
  const revenue = Number(totals._sum.total ?? 0);

  return {
    orders,
    revenue,
    units: units._sum.quantity ?? 0,
    averageOrder: orders > 0 ? revenue / orders : 0,
    newCustomers,
    cancelled,
  };
}

export interface DayPoint {
  /** `YYYY-MM-DD`. */
  day: string;
  orders: number;
  revenue: number;
}

/**
 * Revenue and order count per calendar day, with empty days filled in — a gap
 * in a time series must read as "nothing sold", not as a missing bar.
 */
export async function dailySeries(range: DateRange): Promise<DayPoint[]> {
  const rows = await prisma.$queryRaw<Array<{ day: Date; orders: bigint; revenue: number }>>`
    SELECT date_trunc('day', "createdAt") AS day,
           COUNT(*)                       AS orders,
           COALESCE(SUM("total"), 0)::float8 AS revenue
    FROM "Order"
    WHERE "archivedAt" IS NULL
      AND "status" <> 'Cancelled'
      AND "createdAt" >= ${range.from}
      AND "createdAt" <= ${range.to}
    GROUP BY 1
    ORDER BY 1
  `;

  const found = new Map(
    rows.map((row) => [
      row.day.toISOString().slice(0, 10),
      { orders: Number(row.orders), revenue: Number(row.revenue) },
    ])
  );

  const points: DayPoint[] = [];
  for (let i = 0; i < range.days; i += 1) {
    const day = new Date(range.from.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const hit = found.get(day);
    points.push({ day, orders: hit?.orders ?? 0, revenue: hit?.revenue ?? 0 });
  }

  return points;
}

export interface BestSeller {
  id: string;
  title: string;
  slug: string;
  coverImage: string | null;
  units: number;
  revenue: number;
}

/** Top products by units sold in the window, with the revenue each brought in. */
export async function bestSellers(range: DateRange, take = 5): Promise<BestSeller[]> {
  // `unitPrice * quantity` is beyond groupBy's aggregate set, so this is raw.
  const rows = await prisma.$queryRaw<
    Array<{ productId: string; units: bigint; revenue: number }>
  >`
    SELECT i."productId"                              AS "productId",
           SUM(i."quantity")                          AS units,
           SUM(i."unitPrice" * i."quantity")::float8  AS revenue
    FROM "OrderItem" i
    JOIN "Order" o ON o."id" = i."orderId"
    WHERE i."productId" IS NOT NULL
      AND o."archivedAt" IS NULL
      AND o."status" <> 'Cancelled'
      AND o."createdAt" >= ${range.from}
      AND o."createdAt" <= ${range.to}
    GROUP BY 1
    ORDER BY units DESC
    LIMIT ${take}
  `;

  if (rows.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((row) => row.productId) } },
    select: { id: true, title: true, slug: true, coverImage: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return rows.flatMap((row) => {
    const product = byId.get(row.productId);
    if (!product) return [];
    return [
      {
        ...product,
        units: Number(row.units),
        revenue: Number(row.revenue),
      },
    ];
  });
}

export interface TopClient {
  id: string;
  name: string;
  email: string;
  city: string | null;
  orders: number;
  spent: number;
}

/** Highest-spending accounts in the window. Guest orders have no account. */
export async function topClients(range: DateRange, take = 5): Promise<TopClient[]> {
  const rows = await prisma.order.groupBy({
    by: ["customerId"],
    where: { ...earning(range), customerId: { not: null } },
    _count: true,
    _sum: { total: true },
    orderBy: { _sum: { total: "desc" } },
    take,
  });

  if (rows.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { id: { in: rows.map((row) => row.customerId!) } },
    select: { id: true, name: true, email: true, city: true },
  });
  const byId = new Map(customers.map((customer) => [customer.id, customer]));

  return rows.flatMap((row) => {
    const customer = byId.get(row.customerId!);
    if (!customer) return [];
    return [
      {
        ...customer,
        orders: row._count,
        spent: Number(row._sum.total ?? 0),
      },
    ];
  });
}

const OPEN_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "SHIPPED"];

export interface OpenOrder {
  id: string;
  reference: string;
  name: string;
  city: string;
  phone: string;
  total: number;
  status: OrderStatus;
  createdAt: Date;
  units: number;
}

export interface Pipeline {
  counts: Record<OrderStatus, number>;
  orders: OpenOrder[];
}

/**
 * Everything still in flight — pending, confirmed or shipped — with **no date
 * filter at all**. This is the work queue, and an old order that never shipped
 * is precisely the one that must stay visible.
 */
export async function pipeline(take = 12): Promise<Pipeline> {
  const where = { archivedAt: null, status: { in: OPEN_STATUSES } };

  const [grouped, rows] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where, _count: true }),
    prisma.order.findMany({
      where,
      // Oldest first: the thing that has been waiting longest needs doing next.
      orderBy: { createdAt: "asc" },
      take,
      select: {
        id: true,
        reference: true,
        name: true,
        city: true,
        phone: true,
        total: true,
        status: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
  ]);

  const counts = { PENDING: 0, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 } as Record<
    OrderStatus,
    number
  >;
  for (const row of grouped) counts[row.status] = row._count;

  return {
    counts,
    orders: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      name: row.name,
      city: row.city,
      phone: row.phone,
      total: Number(row.total),
      status: row.status,
      createdAt: row.createdAt,
      units: row.items.reduce((sum, item) => sum + item.quantity, 0),
    })),
  };
}
