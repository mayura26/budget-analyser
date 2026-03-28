"use client";

import { LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import iconSrc from "@/app/icon.png";
import { MainNav } from "@/components/layout/main-nav";
import { logout } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export function MobileHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Top bar — mobile only */}
      <header className="flex md:hidden items-center justify-between h-14 px-4 border-b bg-sidebar text-sidebar-foreground shrink-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Image
            src={iconSrc}
            alt="Budget Analyser"
            width={22}
            height={22}
            className="rounded-md"
          />
          <span className="font-semibold text-sm">Budget Analyser</span>
        </div>
        {/* Spacer to centre the logo */}
        <div className="w-7" />
      </header>

      {/* Overlay */}
      {open && (
        <button
          type="button"
          aria-label="Dismiss menu"
          className="fixed inset-0 z-40 bg-black/60 md:hidden cursor-default border-0 p-0"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 flex flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-300 md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Drawer header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2.5">
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
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 overflow-y-auto px-2">
          <MainNav onNavigate={() => setOpen(false)} />
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
