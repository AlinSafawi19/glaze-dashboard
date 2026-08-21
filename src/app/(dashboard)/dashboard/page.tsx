import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DateRangePicker } from "@/components/date-range";
import { RevenueChart } from "@/components/revenue-chart";
import { ClickableCopyableText } from "@/components/text";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireUser } from "@/lib/dal";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/order-status";
import {
  asInputDate,
  bestSellers,
  dailySeries,
  parseRange,
  pipeline,
  rangeStats,
  topClients,
} from "@/lib/overview";

export const metadata: Metadata = { title: "Overview" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const money = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full p-5 transition-colors hover:border-plum">
      <p className="label-sm text-brown">{label}</p>
      <p className="mt-1.5 font-clash text-[26px] leading-[1.2] tabular-nums">{value}</p>
      {hint && (
        <p className="mt-0.5 font-inter text-[12px] font-light text-brown">{hint}</p>
      )}
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function SectionTitle({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[16px]">{children}</h2>
      {note && (
        <p className="mt-0.5 font-inter text-[12px] font-light italic text-brown">{note}</p>
      )}
    </div>
  );
}

/** How long an order has been sitting — the reason the pipeline ignores dates. */
function waitingFor(since: Date): string {
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (days >= 1) return `${days}d waiting`;
  const hours = Math.floor((Date.now() - since.getTime()) / 3_600_000);
  return hours >= 1 ? `${hours}h waiting` : "just in";
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const range = parseRange(from, to);

  const [user, stats, series, sellers, clients, open] = await Promise.all([
    requireUser(),
    rangeStats(range),
    dailySeries(range),
    bestSellers(range),
    topClients(range),
    pipeline(),
  ]);

  const openTotal = open.counts.PENDING + open.counts.CONFIRMED + open.counts.SHIPPED;

  return (
    <>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle={`${range.days} days · ${asInputDate(range.from)} to ${asInputDate(range.to)}`}
      />

      {/* ── Open work. No date filter: an order that has been waiting since
             last month is exactly the one that must not scroll out of range. ── */}
      <section className="mb-10">
        <SectionTitle note="Everything still in flight, whatever the date range below.">
          Needs you now
        </SectionTitle>

        <div className="mb-4 grid gap-4 tablet:grid-cols-3">
          <Stat
            label="Pending"
            value={String(open.counts.PENDING)}
            hint="Not yet confirmed"
            href="/orders?status=PENDING"
          />
          <Stat
            label="Confirmed"
            value={String(open.counts.CONFIRMED)}
            hint="Waiting to ship"
            href="/orders?status=CONFIRMED"
          />
          <Stat
            label="Shipped"
            value={String(open.counts.SHIPPED)}
            hint="Out for delivery"
            href="/orders?status=SHIPPED"
          />
        </div>

        {openTotal === 0 ? (
          <EmptyState
            title="Nothing open"
            description="Every order has been delivered or cancelled."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Where</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {open.orders.map((order) => (
                <tr key={order.id}>
                  <Td>
                    <Link
                      href={`/orders/${order.id}`}
                      className="transition-colors hover:text-plum"
                    >
                      #{order.number}
                    </Link>
                    <p className="font-inter text-[12px] font-light text-brown">
                      {DATE.format(order.createdAt)} · {waitingFor(order.createdAt)}
                    </p>
                  </Td>
                  <Td>
                    <p>{order.name}</p>
                    <p className="font-inter text-[12px] font-light text-brown">
                      {order.phone}
                    </p>
                  </Td>
                  <Td className="text-brown">{order.city}</Td>
                  <Td className="text-brown tabular-nums">{order.units}</Td>
                  <Td className="tabular-nums">{money(order.total)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[order.status]}>
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* ── Everything below answers "how did this period go?" ── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-beige pt-7">
        <SectionTitle note="Sales, products and customers for the dates you pick.">
          Performance
        </SectionTitle>
        <DateRangePicker from={asInputDate(range.from)} to={asInputDate(range.to)} />
      </div>

      {/* Only the custom breakpoints here — mixing them with Tailwind's own
          `sm:` lets the smaller rule win the cascade and the row never reaches
          five across. */}
      <div className="mb-6 grid gap-4 tablet:grid-cols-2 desktop:grid-cols-5">
        <Stat label="Revenue" value={money(stats.revenue)} hint="Excludes cancelled" />
        <Stat label="Orders" value={String(stats.orders)} href="/orders" />
        <Stat label="Average order" value={money(stats.averageOrder)} />
        <Stat label="Items sold" value={String(stats.units)} />
        <Stat
          label="New customers"
          value={String(stats.newCustomers)}
          href="/customers"
        />
      </div>

      <Card className="mb-10 p-6">
        <RevenueChart points={series} />
      </Card>

      {/* Both panels are flex columns so the table fills whatever height the
          taller of the two sets — a two-line customer cell must not leave the
          sellers card ending short of it. */}
      <div className="grid items-stretch gap-6 desktop:grid-cols-2">
        <section className="flex flex-col">
          <SectionTitle note="By units sold — the same figures behind the storefront badge.">
            Best sellers
          </SectionTitle>
          {sellers.length === 0 ? (
            <EmptyState title="Nothing sold in this range" className="flex-1" />
          ) : (
            <Table minWidth={420} className="flex-1">
              <thead>
                <tr>
                  <Th />
                  <Th>Product</Th>
                  <Th>Units</Th>
                  <Th className="text-right">Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((product) => (
                  <tr key={product.id}>
                    <Td className="w-14">
                      {product.coverImage ? (
                        <Image
                          src={product.coverImage}
                          alt=""
                          width={36}
                          height={44}
                          unoptimized
                          className="h-11 w-9 border border-line object-cover"
                        />
                      ) : (
                        <div className="h-11 w-9 border border-dashed border-line" />
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/products/${product.id}`}
                        className="transition-colors hover:text-plum"
                      >
                        {product.title}
                      </Link>
                    </Td>
                    <Td className="text-brown tabular-nums">{product.units}</Td>
                    <Td className="text-right tabular-nums">{money(product.revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section className="flex flex-col">
          <SectionTitle note="Accounts only — guest checkouts have no customer to rank.">
            Top clients
          </SectionTitle>
          {clients.length === 0 ? (
            <EmptyState title="No account orders in this range" className="flex-1" />
          ) : (
            <Table minWidth={420} className="flex-1">
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>City</Th>
                  <Th>Orders</Th>
                  <Th className="text-right">Spent</Th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <Td>
                      <Link
                        href={`/customers/${client.id}`}
                        className="transition-colors hover:text-plum"
                      >
                        {client.name}
                      </Link>
                      <p className="font-inter text-[12px] font-light text-brown">
                        <ClickableCopyableText value={client.email} label="email address" />
                      </p>
                    </Td>
                    <Td className="text-brown">{client.city ?? "—"}</Td>
                    <Td className="text-brown tabular-nums">{client.orders}</Td>
                    <Td className="text-right tabular-nums">{money(client.spent)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
