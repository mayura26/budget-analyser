"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** sessionStorage key — once dismissed (or shown) it stays hidden for the rest of this visit. */
const DISMISS_KEY = "pwa-install-banner-dismissed";

/** Chromium install prompt; not in all TypeScript `lib` targets. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

function isLikelyIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Phones / tablets — exclude desktop browsers (including desktop Chrome that can fire `beforeinstallprompt`). */
function isLikelyMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isLikelyIOS()) return true;
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return true;
  return /webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function PwaInstallPrompt() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<InstallPromptEvent | null>(null);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
    setMode(null);
    setDeferredPrompt(null);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setMode(null);
  }, [deferredPrompt]);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isLikelyMobileDevice()) return;

    const wasDismissed = () => {
      try {
        return sessionStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    };

    if (wasDismissed()) return;

    let iosTimer: ReturnType<typeof setTimeout>;

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (wasDismissed()) return;
      setDeferredPrompt(e as InstallPromptEvent);
      setMode("android");
      clearTimeout(iosTimer);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    if (isLikelyIOS()) {
      iosTimer = setTimeout(() => {
        if (wasDismissed()) return;
        setMode((prev) => (prev === null ? "ios" : prev));
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      clearTimeout(iosTimer);
    };
  }, []);

  if (mode === null) return null;

  return (
    <section
      className={cn(
        "fixed right-0 bottom-0 left-0 z-[100] border-t border-border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 md:p-4",
      )}
      aria-label="Install app"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {mode === "android"
            ? "Install Budget on your device for quick access from your home screen."
            : "To install this app: tap Share, then Add to Home Screen."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {mode === "android" && (
            <Button type="button" size="sm" onClick={() => void install()}>
              Install
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
