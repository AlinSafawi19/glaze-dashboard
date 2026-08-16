import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HeroPanel } from "@/components/hero-panel";
import { getCurrentUser } from "@/lib/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // A signature-valid cookie whose session has been revoked reaches this point,
  // so the redirect is gated on the real lookup rather than the proxy's guess.
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-caledon px-4 py-12">
      {/* `items-stretch` is what keeps the artwork exactly as tall as the form. */}
      <div className="flex w-full max-w-3xl flex-col items-stretch desktop:flex-row">
        <div className="w-full desktop:w-[360px] desktop:shrink-0">
          <LoginForm />
        </div>

        <HeroPanel className="hidden flex-1 border border-l-0 border-beige desktop:block" />
      </div>
    </main>
  );
}
