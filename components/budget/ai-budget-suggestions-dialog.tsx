"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { applyAiSuggestions } from "@/lib/actions/budget-targets";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { AiBudgetSuggestion } from "@/types";

type DialogError = {
  message: string;
  showSettingsLink?: boolean;
};

const trendConfig = {
  increasing: { icon: ArrowUp, label: "Increasing", className: "text-red-500" },
  decreasing: {
    icon: ArrowDown,
    label: "Decreasing",
    className: "text-green-500",
  },
  stable: {
    icon: ArrowRight,
    label: "Stable",
    className: "text-muted-foreground",
  },
  new: { icon: Star, label: "New", className: "text-blue-500" },
};

export function AiBudgetSuggestionsDialog({
  month,
  open,
  onClose,
  homeCurrency,
}: {
  month: string;
  open: boolean;
  onClose: () => void;
  homeCurrency: SupportedCurrency;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DialogError | null>(null);
  const [suggestions, setSuggestions] = useState<AiBudgetSuggestion[]>([]);
  const [overallNotes, setOverallNotes] = useState("");
  const [amounts, setAmounts] = useState<Map<number, number>>(new Map());
  const [applying, startTransition] = useTransition();

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setOverallNotes("");

    try {
      const res = await fetch("/api/ai-budget-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "AI not enabled") {
          setError({
            message:
              "Turn on Enable AI features in Settings (App → Settings), then save.",
            showSettingsLink: true,
          });
        } else if (data.error === "No API key configured") {
          setError({
            message:
              "No OpenAI API key found. Set the OPENAI_API_KEY environment variable for the server and restart if needed.",
          });
        } else {
          setError({ message: "Something went wrong. Please try again." });
        }
        return;
      }
      const data = await res.json();
      const suggs: AiBudgetSuggestion[] = data.suggestions ?? [];
      setSuggestions(suggs);
      setOverallNotes(data.overallNotes ?? "");
      setAmounts(
        new Map(suggs.map((s) => [s.categoryId, s.suggestedAmount])),
      );
    } catch {
      setError({ message: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  // Fetch on first open
  const [fetched, setFetched] = useState(false);
  if (open && !fetched) {
    setFetched(true);
    fetchSuggestions();
  }

  function handleAmountChange(categoryId: number, value: string) {
    const num = Number(value);
    if (!Number.isNaN(num) && num >= 0) {
      setAmounts((prev) => new Map(prev).set(categoryId, num));
    }
  }

  function handleApplyAll() {
    const entries = suggestions
      .map((s) => ({
        categoryId: s.categoryId,
        amount: amounts.get(s.categoryId) ?? s.suggestedAmount,
      }))
      .filter((e) => e.amount > 0);

    startTransition(async () => {
      await applyAiSuggestions(month, entries);
      onClose();
      router.refresh();
    });
  }

  const total = suggestions.reduce(
    (sum, s) => sum + (amounts.get(s.categoryId) ?? s.suggestedAmount),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg max-h-[80vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Budget Suggestions
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Analysing your spending history…</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center text-sm text-muted-foreground space-y-3">
            <p>{error.message}</p>
            {error.showSettingsLink && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings">Open Settings</Link>
              </Button>
            )}
          </div>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No spending history found to generate suggestions.
          </div>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <div className="space-y-4">
            {overallNotes && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">{overallNotes}</p>
              </div>
            )}

            <div className="space-y-2">
              {suggestions.map((s) => {
                const trend = trendConfig[s.trend];
                const TrendIcon = trend.icon;
                const currentAmount =
                  amounts.get(s.categoryId) ?? s.suggestedAmount;

                return (
                  <div
                    key={s.categoryId}
                    className="rounded-lg border p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm truncate">
                          {s.categoryName}
                        </span>
                        <TrendIcon
                          className={`h-3.5 w-3.5 shrink-0 ${trend.className}`}
                          aria-label={trend.label}
                        />
                      </div>
                      <Input
                        type="number"
                        min={0}
                        step={10}
                        value={currentAmount}
                        onChange={(e) =>
                          handleAmountChange(s.categoryId, e.target.value)
                        }
                        className="w-28 h-8 text-right text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.reasoning}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-semibold">
                  {formatCurrency(total, homeCurrency)}
                </span>
              </div>
              <Button onClick={handleApplyAll} disabled={applying}>
                {applying ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Applying…
                  </span>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Apply All
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
