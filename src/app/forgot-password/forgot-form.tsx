"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { Loader } from "@/components/loader";
import { Button, Card, Field, INPUT_CLASS } from "@/components/ui";
import {
  requestPasswordReset,
  resetPassword,
  type AuthState,
} from "@/lib/actions/auth";

/**
 * Reset in two steps on one screen: ask for the address, then take the code and
 * the new password together.
 *
 * Both halves live here so the address types itself into the second step — a
 * separate page would have to carry it in the URL, where it does not belong.
 */
export function ForgotPasswordForm() {
  const [request, requestAction, requesting] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    {}
  );
  const [reset, resetAction, resetting] = useActionState<AuthState, FormData>(
    resetPassword,
    {}
  );

  const [email, setEmail] = useState("");
  const sentTo = request.sentTo;

  if (reset.ok) {
    return (
      <Card className="h-full p-7">
        <div className="flex h-full flex-col justify-center gap-3">
          <h1 className="text-[24px] leading-[1.3] text-black">Password changed</h1>
          <p className="font-inter text-[14px] font-light text-brown">
            Every other device has been signed out. Sign in with your new password.
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex items-center justify-center border border-black bg-black px-4 py-2.5 label-sm text-accent transition-colors hover:bg-transparent hover:text-black"
          >
            Back to sign in
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full p-7">
      {!sentTo ? (
        <form action={requestAction} className="flex h-full flex-col justify-center gap-4">
          <div className="mb-2">
            <h1 className="text-[24px] leading-[1.3] text-black">Forgot password</h1>
            <p className="mt-1 font-inter text-[14px] font-light italic text-brown">
              We will email you a six-digit code.
            </p>
          </div>

          <Field label="Email">
            <input
              className={INPUT_CLASS}
              name="email"
              type="email"
              placeholder="you@glaze.store"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>

          {request.error && (
            <p className="bg-danger-soft px-3 py-2 font-inter text-[14px] font-light text-error">
              {request.error}
            </p>
          )}

          <Button type="submit" disabled={requesting} className="mt-1">
            {requesting ? (
              <>
                <Loader size={14} />
                Sending…
              </>
            ) : (
              "Send code"
            )}
          </Button>

          <Link
            href="/login"
            className="text-center font-inter text-[13px] font-light text-brown underline-offset-4 hover:text-black hover:underline"
          >
            Back to sign in
          </Link>
        </form>
      ) : (
        <form action={resetAction} className="flex h-full flex-col justify-center gap-4">
          <div className="mb-2">
            <h1 className="text-[24px] leading-[1.3] text-black">Check your email</h1>
            <p className="mt-1 font-inter text-[14px] font-light italic text-brown">
              We sent a code to {sentTo}. It is good for 15 minutes.
            </p>
          </div>

          <input type="hidden" name="email" value={sentTo} />

          <Field label="Code">
            <input
              className={`${INPUT_CLASS} font-mono tracking-[0.3em]`}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
              autoFocus
            />
          </Field>

          <Field label="New password" hint="At least 10 characters, with a number.">
            <input
              className={INPUT_CLASS}
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>

          <Field label="Confirm new password">
            <input
              className={INPUT_CLASS}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>

          {reset.error && (
            <p className="bg-danger-soft px-3 py-2 font-inter text-[14px] font-light text-error">
              {reset.error}
            </p>
          )}

          <Button type="submit" disabled={resetting} className="mt-1">
            {resetting ? (
              <>
                <Loader size={14} />
                Saving…
              </>
            ) : (
              "Set new password"
            )}
          </Button>
        </form>
      )}
    </Card>
  );
}
