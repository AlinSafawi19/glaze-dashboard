import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HeroPanel } from "@/components/hero-panel";
import { getCurrentUser } from "@/lib/dal";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  // Someone already signed in has no business here; the settings screen is
  // where a password is changed with the old one to hand.
  if (await getCurrentUser()) redirect("/settings");

  return (
    <main className="flex min-h-screen items-center justify-center bg-caledon px-4 py-12">
      <div className="flex w-full max-w-3xl flex-col items-stretch desktop:flex-row">
        <div className="w-full desktop:w-[360px] desktop:shrink-0">
          <ForgotPasswordForm />
        </div>

        <HeroPanel className="hidden flex-1 border border-l-0 border-beige desktop:block" />
      </div>
    </main>
  );
}
