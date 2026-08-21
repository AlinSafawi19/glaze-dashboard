import Link from "next/link";
import {
  Boxes,
  ClipboardList,
  Droplets,
  FileText,
  LayoutDashboard,
  Layers,
  Megaphone,
  Settings,
  Tag,
  Users,
} from "lucide-react";

import { ActionButton } from "@/components/confirm-button";
import { Logomark } from "@/components/logomark";
import { NotificationBell } from "@/components/notification-bell";
import { RefreshButton } from "@/components/refresh-button";
import { cx } from "@/components/ui";
import { logout } from "@/lib/actions/auth";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { MobileNav } from "./mobile-nav";
import { NavLink } from "./nav-link";

/**
 * The wordmark is artwork, not a control with an edge, so the browser's default
 * ring reads as a box drawn around the logo. Keyboard users still get one — the
 * app's own plum outline — but a mouse click no longer leaves it behind.
 */
const LOGO_FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-plum";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Boxes },
  { href: "/orders", label: "Orders", icon: ClipboardList, badge: "orders" },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/brands", label: "Brands", icon: Tag },
  { href: "/categories", label: "Categories", icon: Layers },
  { href: "/collections", label: "Collections", icon: Layers },
  { href: "/skin-types", label: "Skin types", icon: Droplets },
  { href: "/ticker", label: "Ticker", icon: Megaphone },
  { href: "/utility-pages", label: "Utility pages", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const pendingOrders = await prisma.order.count({
    where: { status: "PENDING", archivedAt: null },
  });

  /**
   * Built once and rendered in two places — the desktop sidebar and the mobile
   * drawer. Sharing the elements rather than the markup is what stops the two
   * menus drifting apart as pages are added.
   */
  const brand = (
    <div className="px-5 py-6">
      <Link href="/dashboard" className={cx("block", LOGO_FOCUS)}>
        <Logomark tone="plum" className="max-w-[128px]" />
      </Link>
    </div>
  );

  const links = (
    <nav className="flex flex-1 flex-col gap-1 px-3 pb-3">
      {NAV.map(({ href, label, icon: Icon, ...rest }) => (
        <NavLink key={href} href={href} label={label}>
          <Icon size={16} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{label}</span>
          {"badge" in rest && rest.badge === "orders" && pendingOrders > 0 && (
            <span className="ml-auto bg-plum px-1.5 py-0.5 font-clash text-[11px] font-medium text-white">
              {pendingOrders}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-beige px-5 py-4">
      <p className="truncate label-sm text-black">{user.name}</p>
      <p className="truncate font-inter text-[12px] font-light text-brown">{user.email}</p>
      <ActionButton
        action={logout}
        label="Sign out"
        variant="row"
        className="mt-1 -ml-1.5"
        confirmTitle="Sign out"
        confirm="You will need your email and password to get back in."
        confirmLabel="Sign out"
      />
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col desktop:flex-row">
      {/* Below `desktop` this is replaced by the drawer in the bar opposite. */}
      <aside className="hidden shrink-0 flex-col border-beige bg-lavender desktop:sticky desktop:top-0 desktop:flex desktop:h-screen desktop:w-60 desktop:border-r">
        {brand}
        {links}
        {account}
      </aside>

      <main className="min-w-0 flex-1">
        {/* One bar for the tools that belong to every screen rather than any
            one of them — and, on mobile, the way into the menu. */}
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-beige bg-caledon/90 px-5 py-2 backdrop-blur desktop:px-10">
          <MobileNav>
            {brand}
            {links}
            {account}
          </MobileNav>

          <Link
            href="/dashboard"
            className={cx("block w-[104px] desktop:hidden", LOGO_FOCUS)}
          >
            <Logomark tone="plum" />
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <RefreshButton />
            <NotificationBell />
          </div>
        </div>

        <div className="px-5 py-7 desktop:px-10 desktop:py-9">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
