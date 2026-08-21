"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Loader } from "@/components/loader";
import { Button, Card, Field, INPUT_CLASS } from "@/components/ui";
import { verifyStaffEmail, type AuthState } from "@/lib/actions/auth";

/**
 * The code screen for an account whose address has never been confirmed.
 *
 * It is reachable without signing in, because not being able to sign in is
 * exactly the situation it exists for. The code is the credential.
 */
export function VerifyEmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    verifyStaffEmail,
    {}
  );

  if (state.ok) {
    return (
      <Card className="h-full p-7">
        <div className="flex h-full flex-col justify-center gap-3">
          <h1 className="text-[24px] leading-[1.3] text-black">Email confirmed</h1>
          <p className="font-inter text-[14px] font-light text-brown">
            That address is proven. You can sign in now.
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex items-center justify-center border border-black bg-black px-4 py-2.5 label-sm text-accent transition-colors hover:bg-transparent hover:text-black"
          >
            Sign in
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full p-7">
      <form action={action} className="flex h-full flex-col justify-center gap-4">
        <div className="mb-2">
          <h1 className="text-[24px] leading-[1.3] text-black">Confirm your email</h1>
          <p className="mt-1 font-inter text-[14px] font-light italic text-brown">
            {email
              ? `Enter the six-digit code we sent to ${email}.`
              : "Enter your address and the six-digit code we sent you."}
          </p>
        </div>

        <Field label="Email">
          <input
            className={INPUT_CLASS}
            name="email"
            type="email"
            defaultValue={email}
            placeholder="you@glaze.store"
            autoComplete="username"
            required
            autoFocus={!email}
          />
        </Field>

        <Field label="Code">
          <input
            className={`${INPUT_CLASS} font-mono tracking-[0.3em]`}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            required
            autoFocus={Boolean(email)}
          />
        </Field>

        {state.error && (
          <p className="bg-danger-soft px-3 py-2 font-inter text-[14px] font-light text-error">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="mt-1">
          {pending ? (
            <>
              <Loader size={14} />
              Checking…
            </>
          ) : (
            "Confirm email"
          )}
        </Button>

        <p className="text-center font-inter text-[13px] font-light text-brown">
          No code? <Link href="/login" className="text-plum underline underline-offset-4">Try signing in</Link>{" "}
          and we will send a fresh one.
        </p>
      </form>
    </Card>
  );
}
