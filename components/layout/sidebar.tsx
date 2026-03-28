"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowDownUp,
  Upload,
  CreditCard,
  Tag,
  Settings,
  LogOut,
  CalendarDays,
} from "lucide-react";
import { logout } from "@/lib/actions/auth";
import iconSrc from "@/app/icon.png";

const NAV_ITEMS = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/budget",       label: "Budget",       icon: CalendarDays },
  { href: "/transactions", label: "Transactions", icon: ArrowDownUp },
  { href: "/import",       label: "Import",       icon: Upload },
  { href: "/accounts",     label: "Accounts",     icon: CreditCard },
  { href: "/categories",   label: "Categories",   icon: Tag },
  { href: "/settings",     label: "Settings",     icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 hidden md:flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Logo header */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border">
        <Image
          src={iconSrc}
          alt="Budget Analyser"
          width={28}
          height={28}
          className="rounded-md"
        />
        <span className="font-semibold text-sm tracking-tight">
          Budget Analyser
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors relative",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="border-t border-sidebar-border p-2">
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-sidebar-muted rounded-md hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
