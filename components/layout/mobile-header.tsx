"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
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

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Top bar — mobile only */}
      <header className="flex md:hidden items-center justify-between h-14 px-4 border-b bg-sidebar text-sidebar-foreground shrink-0">
        <button
          onClick={() => setOpen(true)}
          className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image src={iconSrc} alt="Budget Analyser" width={22} height={22} className="rounded-md" />
          <span className="font-semibold text-sm">Budget Analyser</span>
        </div>
        {/* Spacer to centre the logo */}
        <div className="w-7" />
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 flex flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-300 md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Image src={iconSrc} alt="Budget Analyser" width={28} height={28} className="rounded-md" />
            <span className="font-semibold text-sm tracking-tight">Budget Analyser</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 overflow-y-auto space-y-0.5 px-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
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
        <div className="border-t border-sidebar-border p-2 shrink-0">
          <form action={logout}>
            <button
              type="submit"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-sidebar-muted rounded-md hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
