"use client";

import { Ban, Check, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addAIScheduleSuggestion,
  muteAIScheduleSuggestion,
} from "@/lib/actions/scheduled";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
import type { Category } from "@/types";

interface Suggestion {
  name: string;
  displayName?: string;
  internalName?: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  categoryId: number | null;
  reasoning: string;
  confidence: number;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function suggestionKey(s: Suggestion): string {
  return `${s.name}|${s.frequency}|${s.amount}|${s.startDate}|${s.reasoning}`;
}

interface Props {
  categories: Category[];
  homeCurrency: SupportedCurrency;
}

type DialogError = {
  message: string;
  showSettingsLink?: boolean;
};

export function AISchedulerDialog({
  categories: _categories,
  homeCurrency,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DialogError | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setAdded(new Set());
    setMuted(new Set());

    try {
      const res = await fetch("/api/ai-scheduler", { method: "POST" });
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
      setSuggestions(data.suggestions ?? []);
    } catch {
      setError({ message: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleAdd(suggestion: Suggestion) {
    const key = suggestionKey(suggestion);
    startTransition(async () => {
      const result = await addAIScheduleSuggestion({
        name: suggestion.displayName ?? suggestion.name,
        displayName: suggestion.displayName ?? suggestion.name,
        internalName: suggestion.internalName ?? suggestion.name,
        amount: suggestion.amount,
        frequency: suggestion.frequency,
        startDate: suggestion.startDate,
        categoryId: suggestion.categoryId,
      });
      if (result.success) {
        setAdded((prev) => new Set(prev).add(key));
      }
    });
  }

  function handleMute(suggestion: Suggestion) {
    const key = suggestionKey(suggestion);
    startTransition(async () => {
      const result = await muteAIScheduleSuggestion({
        internalName: suggestion.internalName ?? suggestion.name,
        frequency: suggestion.frequency,
        amount: suggestion.amount,
      });
      if (result.success) {
        setMuted((prev) => new Set(prev).add(key));
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen}>
        <Sparkles className="h-4 w-4 mr-1" />
        AI Suggestions
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg max-h-[80vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Smart Schedule Suggestions
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Analysing your transaction history…</p>
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
              No recurring patterns detected in the last 6 months.
            </div>
          )}

          {!loading && !error && suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {suggestions.length} recurring pattern
                {suggestions.length !== 1 ? "s" : ""} detected — click to add
                any to your schedule.
              </p>
              {suggestions.map((s) => {
                const key = suggestionKey(s);
                const isAdded = added.has(key);
                const isMuted = muted.has(key);
                const isIncome = s.amount > 0;
                const label = s.displayName ?? s.name;
                return (
                  <div
                    key={key}
                    className={`rounded-lg border p-4 space-y-2 transition-opacity ${isAdded || isMuted ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium truncate">{label}</p>
                        <Badge variant="outline" className="text-xs">
                          {FREQ_LABELS[s.frequency] ?? s.frequency}
                        </Badge>
                      </div>
                      <span
                        className={`text-lg font-semibold whitespace-nowrap ${
                          isIncome ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isIncome ? "+" : "-"}
                        {formatCurrency(s.amount, homeCurrency)}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {s.reasoning}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-xs text-muted-foreground">
                        Next: {s.startDate}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={isMuted ? "ghost" : "outline"}
                          disabled={isAdded || isMuted}
                          onClick={() => handleMute(s)}
                          className="h-7 text-xs"
                        >
                          {isMuted ? (
                            <>
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Muted
                            </>
                          ) : (
                            "Mute"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant={isAdded ? "ghost" : "default"}
                          disabled={isAdded || isMuted}
                          onClick={() => handleAdd(s)}
                          className="h-7 text-xs"
                        >
                          {isAdded ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Added
                            </>
                          ) : (
                            "Add to schedule"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
