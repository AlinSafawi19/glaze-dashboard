import type { Metadata } from "next";

import { HeroPanel } from "@/components/hero-panel";
import { VerifyEmailForm } from "./verify-form";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-caledon px-4 py-12">
      <div className="flex w-full max-w-3xl flex-col items-stretch desktop:flex-row">
        <div className="w-full desktop:w-[360px] desktop:shrink-0">
          <VerifyEmailForm email={(email ?? "").trim().toLowerCase()} />
        </div>

        <HeroPanel className="hidden flex-1 border border-l-0 border-beige desktop:block" />
      </div>
    </main>
  );
}
