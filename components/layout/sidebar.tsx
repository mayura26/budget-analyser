"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import iconSrc from "@/app/icon.png";
import { MainNav } from "@/components/layout/main-nav";
import { logout } from "@/lib/actions/auth";

export function Sidebar() {
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
      <nav className="flex-1 py-3 overflow-y-auto px-2">
        <MainNav />
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
