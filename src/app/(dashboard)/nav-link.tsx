"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui";

export function NavLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // `/products/abc` should still light up `/products`.
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex shrink-0 items-center gap-2.5 rounded-none px-3 py-2 label-sm desktop:shrink",
        "[transition:background-color_0.3s_cubic-bezier(0.44,0,0.56,1),color_0.3s_cubic-bezier(0.44,0,0.56,1)]",
        active ? "bg-blush text-black" : "text-brown hover:bg-dusty hover:text-black"
      )}
    >
      {children}
    </Link>
  );
}
