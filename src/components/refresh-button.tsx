"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { cx } from "@/components/ui";

/**
 * Re-runs the current route's server components without a full page reload, so
 * open forms and scroll position survive. Every screen here reads live data, so
 * this is the "did that order come in yet?" button.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label="Refresh this page"
      title="Refresh"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="flex h-9 w-9 cursor-pointer items-center justify-center text-brown transition-colors hover:text-black disabled:cursor-not-allowed"
    >
      <RotateCw
        size={17}
        strokeWidth={1.5}
        className={cx(pending && "animate-spin")}
      />
    </button>
  );
}
