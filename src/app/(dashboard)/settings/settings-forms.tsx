"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Loader } from "@/components/loader";
import { Modal } from "@/components/modal";
import { BrandSelect } from "@/components/select";
import { Button, Card, Field, INPUT_CLASS } from "@/components/ui";
import {
  changeEmail,
  changePassword,
  confirmEmailChange,
  type AuthState,
} from "@/lib/actions/auth";
import { createApiKey, type KeyState } from "@/lib/actions/api-keys";

function Notice({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      className={`px-3 py-2 font-inter text-[14px] font-light ${
        tone === "error" ? "bg-danger-soft text-error" : "bg-success-soft text-success"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * Changing the sign-in address takes two steps: the password proves it is you,
 * and a code sent to the new address proves the address is yours. Nothing moves
 * until the second one comes back, so a typo costs an undelivered email rather
 * than an account that cannot sign in.
 */
export function EmailForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(changeEmail, {});
  const [confirmed, confirmAction, confirming] = useActionState<AuthState, FormData>(
    confirmEmailChange,
    {}
  );

  const pendingAddress = state.sentTo;

  if (pendingAddress && !confirmed.ok) {
    return (
      <Card className="flex flex-col gap-5 p-6">
        <div>
          <h2 className="text-[18px] leading-[1.3]">Confirm your new email</h2>
          <p className="mt-0.5 font-inter text-[14px] font-light italic text-brown">
            We sent a six-digit code to {pendingAddress}. It is good for 15 minutes,
            and the address does not change until you enter it.
          </p>
        </div>

        <form action={confirmAction} className="flex max-w-sm flex-col gap-4">
          <input type="hidden" name="email" value={pendingAddress} />

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

          {confirmed.error && <Notice tone="error">{confirmed.error}</Notice>}

          <Button type="submit" disabled={confirming}>
            {confirming ? (
              <>
                <Loader size={14} />
                Checking…
              </>
            ) : (
              "Confirm email"
            )}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-[18px] leading-[1.3]">Change your email</h2>
        <p className="mt-0.5 font-inter text-[14px] font-light italic text-brown">
          This is the address you sign in with. Confirm with your password.
        </p>
      </div>

      <form action={action} className="flex max-w-sm flex-col gap-4">
        <Field label="New email">
          <input
            className={INPUT_CLASS}
            name="email"
            type="email"
            defaultValue={current}
            placeholder="you@glaze.store"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Current password">
          <input
            className={INPUT_CLASS}
            name="currentPassword"
            type="password"
            placeholder="Your current password"
            autoComplete="current-password"
            required
          />
        </Field>

        {state.error && <Notice tone="error">{state.error}</Notice>}
        {confirmed.ok && <Notice tone="ok">Email updated.</Notice>}

        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader size={14} />
              Sending code…
            </>
          ) : (
            "Update email"
          )}
        </Button>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, {});

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div>
        <h2 className="text-[18px] leading-[1.3]">Change your password</h2>
        <p className="mt-0.5 font-inter text-[14px] font-light italic text-brown">
          At least 10 characters, with a letter and a number.
        </p>
      </div>

      <form action={action} className="flex max-w-sm flex-col gap-4">
        <Field label="Current password">
          <input
            className={INPUT_CLASS}
            name="currentPassword"
            type="password"
            placeholder="Your current password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="New password">
          <input
            className={INPUT_CLASS}
            name="newPassword"
            type="password"
            placeholder="At least 10 characters"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirm new password">
          <input
            className={INPUT_CLASS}
            name="confirmPassword"
            type="password"
            placeholder="Type it again"
            autoComplete="new-password"
            required
          />
        </Field>

        {state.error && <Notice tone="error">{state.error}</Notice>}
        {state.ok && <Notice tone="ok">Password updated.</Notice>}

        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader size={14} />
              Saving…
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </form>
    </Card>
  );
}

const EXPIRY_OPTIONS = [
  { value: "3", label: "3 months" },
  { value: "12", label: "12 months" },
  { value: "24", label: "24 months" },
  { value: "0", label: "Never" },
];

/** The key is shown once. Copying it has to be one obvious click. */
function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard is blocked on insecure origins; the text stays selectable.
      setCopied(false);
    }
  }

  return (
    <div className="flex items-stretch border border-beige bg-caledon">
      <code className="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-[12px] text-black">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy key"}
        className="flex shrink-0 items-center gap-1.5 border-l border-beige px-3 label-sm text-brown transition-colors hover:bg-black hover:text-accent"
      >
        {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={1.5} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function NewKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createApiKey, {});
  const [dismissed, setDismissed] = useState(false);

  // A fresh key opens the dialog; dismissing it is what closes it, not a
  // re-render, so the value cannot vanish before it has been copied.
  useEffect(() => {
    if (state.created) setDismissed(false);
  }, [state.created]);

  return (
    <>
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Name" className="min-w-[200px] flex-1">
            <input
              className={INPUT_CLASS}
              name="name"
              placeholder="Storefront"
              required
            />
          </Field>
          <Field label="Expires in" className="min-w-[160px]">
            <BrandSelect
              name="months"
              options={EXPIRY_OPTIONS}
              defaultValue="12"
              placeholder="Choose a lifetime"
              isClearable={false}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <Loader size={14} />
                Creating…
              </>
            ) : (
              "Create key"
            )}
          </Button>
        </div>

        {state.error && <Notice tone="error">{state.error}</Notice>}
      </form>

      <Modal
        open={Boolean(state.created) && !dismissed}
        onClose={() => setDismissed(true)}
        title="Your new API key"
        description="Copy it now — only its hash is stored, so this is the one time it can be read."
        width="max-w-lg"
        footer={
          <Button type="button" onClick={() => setDismissed(true)}>
            Done
          </Button>
        }
      >
        {state.created && <CopyField value={state.created} />}
      </Modal>
    </>
  );
}
