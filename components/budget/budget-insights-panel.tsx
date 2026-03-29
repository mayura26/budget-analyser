"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetInsight } from "@/types";

const insightConfig = {
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20",
  },
  suggestion: {
    icon: Lightbulb,
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/20",
  },
  win: {
    icon: Trophy,
    bg: "bg-green-500/10",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-500/20",
  },
};

export function BudgetInsightsPanel({
  month,
  hasBudget,
}: {
  month: string;
  hasBudget: boolean;
}) {
  const [insights, setInsights] = useState<BudgetInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-budget-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to generate insights");
      }
      const data = await res.json();
      setInsights(data.insights ?? []);
      setGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Budget Insights
          </CardTitle>
          <div className="flex items-center gap-2">
            {!generated ? (
              <Button
                size="sm"
                variant="outline"
                onClick={generate}
                disabled={loading || !hasBudget}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Analysing...
                  </span>
                ) : (
                  "Generate Insights"
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {!generated && !loading && !error && (
            <p className="text-sm text-muted-foreground">
              {hasBudget
                ? "Get AI-powered analysis of your spending trends and budget performance."
                : "Set budget targets first to enable AI insights."}
            </p>
          )}

          {generated && insights.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No insights to show right now. Check back as more spending data
              comes in.
            </p>
          )}

          {insights.length > 0 && (
            <div className="space-y-2">
              {insights.map((insight, i) => {
                const config = insightConfig[insight.type];
                const Icon = config.icon;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${config.bg} ${config.border}`}
                  >
                    <Icon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${config.text}`}
                    />
                    <div className="min-w-0">
                      {insight.category && (
                        <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                          {insight.category}
                        </span>
                      )}
                      <p className="text-sm">{insight.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
