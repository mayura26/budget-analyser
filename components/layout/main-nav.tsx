"use client";

import {
  ArrowDownUp,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Tag,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_GROUPS: {
  title: string;
  headingClass: string;
  items: NavItem[];
}[] = [
  {
    title: "Overview",
    headingClass: "text-sky-400",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Planning",
    headingClass: "text-emerald-400",
    items: [
      { href: "/budget", label: "Budget", icon: CalendarDays },
      { href: "/transactions", label: "Transactions", icon: ArrowDownUp },
    ],
  },
  {
    title: "Data",
    headingClass: "text-amber-400",
    items: [
      { href: "/import", label: "Import", icon: Upload },
      { href: "/accounts", label: "Accounts", icon: CreditCard },
      { href: "/categories", label: "Categories", icon: Tag },
    ],
  },
  {
    title: "App",
    headingClass: "text-violet-400",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

type MainNavProps = {
  /** Called when a nav link is activated (e.g. close mobile drawer). */
  onNavigate?: () => void;
};

export function MainNav({ onNavigate }: MainNavProps) {
  const pathname = usePathname();

  return (
    <>
      {NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.title} className={cn(groupIndex > 0 && "mt-4")}>
          <p
            className={cn(
              "px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider",
              group.headingClass,
            )}
          >
            {group.title}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors relative",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-sidebar-accent-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
