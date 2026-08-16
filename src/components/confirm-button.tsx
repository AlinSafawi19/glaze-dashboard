"use client";

import { useState, useTransition } from "react";

import { Loader } from "@/components/loader";
import { Modal } from "@/components/modal";
import { Button, CancelButton, cx, type ButtonVariant } from "@/components/ui";

/**
 * Every destructive or irreversible action in the app goes through here:
 * archiving, restoring, deleting, revoking a key, signing out. The dialog is
 * the app's own rather than `window.confirm`, so it is styled, keyboard
 * accessible and shows progress while the server action runs.
 */
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "ghost",
  confirm,
  confirmTitle,
  confirmLabel,
  className,
  icon,
}: {
  action: () => Promise<void>;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  /** Body copy for the dialog. Omit to run the action immediately. */
  confirm?: string;
  confirmTitle?: string;
  confirmLabel?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      await action();
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        className={className}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending ? (
          <>
            <Loader size={14} />
            {pendingLabel ?? label}
          </>
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </Button>

      {confirm && (
        <Modal
          open={open}
          onClose={() => !pending && setOpen(false)}
          title={confirmTitle ?? label}
          description={confirm}
          footer={
            <>
              <CancelButton type="button" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </CancelButton>
              <Button
                type="button"
                variant={variant === "ghost" ? "primary" : variant}
                onClick={run}
                disabled={pending}
                className={cx(pending && "pointer-events-none")}
              >
                {pending ? (
                  <>
                    <Loader size={14} />
                    Working…
                  </>
                ) : (
                  confirmLabel ?? label
                )}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
