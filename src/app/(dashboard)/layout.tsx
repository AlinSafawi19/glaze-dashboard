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
import { logout } from "@/lib/actions/auth";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { NavLink } from "./nav-link";

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

  return (
    <div className="flex min-h-screen flex-col desktop:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-beige bg-lavender desktop:sticky desktop:top-0 desktop:h-screen desktop:w-60 desktop:border-b-0 desktop:border-r">
        <div className="px-5 py-6">
          <Link href="/dashboard" className="block">
            <Logomark tone="plum" className="max-w-[128px]" />
          </Link>
        </div>

        <nav className="flex flex-1 flex-row gap-1 overflow-x-auto px-3 pb-3 desktop:flex-col desktop:overflow-visible desktop:pb-0">
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

        <div className="hidden border-t border-beige px-5 py-4 desktop:block">
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
      </aside>

      <main className="min-w-0 flex-1">
        {/* One bar for the tools that belong to every screen rather than any
            one of them. */}
        <div className="sticky top-0 z-30 flex items-center justify-end gap-1 border-b border-beige bg-caledon/90 px-5 py-2 backdrop-blur desktop:px-10">
          <RefreshButton />
          <NotificationBell />
        </div>

        <div className="px-5 py-7 desktop:px-10 desktop:py-9">
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
