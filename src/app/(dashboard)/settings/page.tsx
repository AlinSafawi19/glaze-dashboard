import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/confirm-button";
import { ClickableCopyableText } from "@/components/text";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { revokeApiKey } from "@/lib/actions/api-keys";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { EmailForm, NewKeyForm, PasswordForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function SettingsPage() {
  const user = await requireUser();
  const isOwner = user.role === "OWNER";

  // Not on the session user, which every page in the app carries: this is the
  // one screen that shows it, so it is read here rather than on every request.
  const { emailVerifiedAt } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { emailVerifiedAt: true },
  });

  const keys = isOwner
    ? await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } })
    : [];

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account and the storefront's access keys." />

      <div className="flex flex-col gap-8">
        <Card className="p-6">
          <h2 className="text-sm font-semibold">Account</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Name</dt>
              <dd className="mt-0.5">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2">
                <ClickableCopyableText value={user.email} label="email address" />
                {emailVerifiedAt ? (
                  <Badge tone="success">Verified</Badge>
                ) : (
                  <Badge tone="warn">Unverified</Badge>
                )}
              </dd>
              <dd className="mt-1 text-xs text-muted">
                {emailVerifiedAt ? (
                  `Confirmed ${DATE.format(emailVerifiedAt)}`
                ) : (
                  <>
                    {/* Sign-in refuses an unproven address, so this is worth a
                        way out rather than a bare label. */}
                    Sign-in needs a confirmed address.{" "}
                    <Link
                      href={`/verify-email?email=${encodeURIComponent(user.email)}`}
                      className="text-plum underline underline-offset-4"
                    >
                      Confirm it
                    </Link>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Role</dt>
              <dd className="mt-0.5">
                <Badge tone={isOwner ? "success" : "neutral"}>
                  {isOwner ? "Owner" : "Staff"}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-6 desktop:grid-cols-2">
          <EmailForm current={user.email} />
          <PasswordForm />
        </div>

        {isOwner && (
          <Card className="flex flex-col gap-5 p-6">
            <div>
              <h2 className="text-sm font-semibold">Storefront API keys</h2>
              <p className="mt-0.5 text-sm text-muted">
                The storefront reads the catalogue and posts orders with one of these. Only
                the hash is stored, so a key is visible once and never again — revoke and
                mint a new one if it is lost.
              </p>
            </div>

            <NewKeyForm />

            {keys.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Key</Th>
                    <Th>Created</Th>
                    <Th>Expires</Th>
                    <Th>Last used</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => {
                    const expired = key.expiresAt && key.expiresAt < new Date();
                    const dead = Boolean(key.revokedAt) || expired;

                    return (
                      <tr key={key.id} className={dead ? "opacity-55" : undefined}>
                        <Td label="Name" className="font-medium">
                          {key.name}
                          {key.revokedAt && (
                            <span className="ml-2">
                              <Badge tone="danger">Revoked</Badge>
                            </span>
                          )}
                          {!key.revokedAt && expired && (
                            <span className="ml-2">
                              <Badge tone="warn">Expired</Badge>
                            </span>
                          )}
                        </Td>
                        <Td label="Key" className="font-mono text-xs text-muted">
                          {key.keyPrefix}…
                        </Td>
                        <Td label="Created" className="text-muted">
                          {DATE.format(key.createdAt)}
                        </Td>
                        <Td label="Expires" className="text-muted">
                          {key.expiresAt ? DATE.format(key.expiresAt) : "Never"}
                        </Td>
                        <Td label="Last used" className="text-muted">
                          {key.lastUsedAt ? DATE.format(key.lastUsedAt) : "Never"}
                        </Td>
                        <Td>
                          <div className="flex justify-end">
                            {!key.revokedAt && (
                              <ActionButton
                                action={revokeApiKey.bind(null, key.id)}
                                label="Revoke"
                                variant="rowDanger"
                                confirmTitle="Revoke this key?"
                                confirm="Anything using it stops working immediately, including the storefront if this is the key it holds. This cannot be undone — you would need to mint a new key."
                                confirmLabel="Revoke key"
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
          </Card>
        )}
      </div>
    </>
  );
}
