"use client";

import { useActionState } from "react";

import { Loader } from "@/components/loader";
import { Button, Card, Field, INPUT_CLASS } from "@/components/ui";
import { login, type AuthState } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, {});

  return (
    <Card className="h-full p-7">
      <form action={action} className="flex h-full flex-col justify-center gap-4">
        <div className="mb-2">
          <h1 className="text-[24px] leading-[1.3] text-black">Sign in</h1>
          <p className="mt-1 font-inter text-[14px] font-light italic text-brown">
            Manage the Glaze catalogue and orders.
          </p>
        </div>

        <Field label="Email">
          <input
            className={INPUT_CLASS}
            name="email"
            type="email"
            placeholder="you@glaze.store"
            autoComplete="username"
            required
            autoFocus
          />
        </Field>

        <Field label="Password">
          <input
            className={INPUT_CLASS}
            name="password"
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            required
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </Card>
  );
}
