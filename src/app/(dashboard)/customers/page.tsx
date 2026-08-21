import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/confirm-button";
import { SearchInput } from "@/components/search-input";
import {
  Badge,
  EmptyState,
  FilterBar,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { archiveCustomer, restoreCustomer } from "@/lib/actions/customers";
import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ClickableCopyableText } from "@/components/text";

export const metadata: Metadata = { title: "Customers" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; q?: string }>;
}) {
  const { archived, q } = await searchParams;
  const showArchived = archived === "1";
  const search = (q ?? "").trim();

  const where = {
    ...(showArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [customers, user] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        createdAt: true,
        archivedAt: true,
        _count: { select: { orders: true } },
        // Only orders that were actually paid for count toward spend.
        orders: {
          where: { status: { not: "CANCELLED" }, archivedAt: null },
          select: { total: true },
        },
      },
    }),
    getCurrentUser(),
  ]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Shoppers with an account on the storefront."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <FilterBar className="mb-0 min-w-0 gap-4">
          <Link
            href="/customers"
            className={
              showArchived ? "text-brown hover:text-black" : "text-black underline underline-offset-4"
            }
          >
            Active
          </Link>
          <Link
            href="/customers?archived=1"
            className={
              showArchived ? "text-black underline underline-offset-4" : "text-brown hover:text-black"
            }
          >
            Including archived
          </Link>
        </FilterBar>

        <SearchInput placeholder="Search name, email or phone" />
      </div>

      {customers.length === 0 ? (
        <EmptyState
          title={search ? "Nothing matched that search" : "No customers yet"}
          description={
            search
              ? "Try a shorter search, or clear it to see everyone."
              : "Accounts appear here as soon as someone signs up on the storefront."
          }
          action={search ? <LinkButton href="/customers">Clear search</LinkButton> : undefined}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Phone</Th>
              <Th>City</Th>
              <Th>Orders</Th>
              <Th>Spent</Th>
              <Th>Joined</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const spent = customer.orders.reduce((sum, o) => sum + Number(o.total), 0);

              return (
                <tr key={customer.id}>
                  <Td label="Customer">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="transition-colors hover:text-plum"
                    >
                      {customer.name}
                    </Link>
                    <p className="font-inter text-[12px] font-light text-brown">
                      <ClickableCopyableText value={customer.email} label="email address" />
                    </p>
                    {customer.archivedAt && (
                      <span className="mt-1 inline-block">
                        <Badge tone="warn">Archived</Badge>
                      </span>
                    )}
                  </Td>
                  <Td label="Phone" className="text-brown">
                    {customer.phone ? (
                      <ClickableCopyableText value={customer.phone} label="phone number" />
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td label="City" className="text-brown">
                    {customer.city ?? "—"}
                  </Td>
                  <Td label="Orders" className="text-brown tabular-nums">
                    {customer._count.orders}
                  </Td>
                  <Td label="Spent" className="tabular-nums">
                    ${spent}
                  </Td>
                  <Td label="Joined" className="text-brown">
                    {DATE.format(customer.createdAt)}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <LinkButton href={`/customers/${customer.id}`} variant="row">
                        Open
                      </LinkButton>
                      {customer.archivedAt ? (
                        <ActionButton
                          action={restoreCustomer.bind(null, customer.id)}
                          label="Restore"
                          variant="row"
                          confirmTitle="Restore this account?"
                          confirm="They will be able to sign in again. Any session that was cut off stays cut off — they sign in fresh."
                          confirmLabel="Restore"
                        />
                      ) : (
                        <ActionButton
                          action={archiveCustomer.bind(null, customer.id)}
                          label="Archive"
                          variant="row"
                          confirmTitle="Archive this account?"
                          confirm="They are signed out everywhere immediately and cannot sign in again until restored. Their orders are untouched."
                          confirmLabel="Archive"
                        />
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
