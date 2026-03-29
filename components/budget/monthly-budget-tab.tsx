"use client";

import { CalendarClock, Copy, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BudgetCategoryList } from "@/components/budget/budget-category-list";
import { BudgetInsightsPanel } from "@/components/budget/budget-insights-panel";
import { BudgetSummaryStrip } from "@/components/budget/budget-summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  copyBudgetForward,
  initFromAverages,
} from "@/lib/actions/budget-targets";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatMonth } from "@/lib/utils";
import type { BudgetCategoryRow, BudgetSummary } from "@/types";

export function MonthlyBudgetTab({
  month,
  rows,
  summary,
  hasPreviousMonth,
  previousMonth,
  aiEnabled,
  readOnly,
  homeCurrency,
}: {
  month: string;
  rows: BudgetCategoryRow[];
  summary: BudgetSummary;
  hasPreviousMonth: boolean;
  previousMonth: string;
  aiEnabled: boolean;
  readOnly: boolean;
  homeCurrency: SupportedCurrency;
}) {
  const hasBudget = rows.some((r) => r.targetAmount > 0);
  const hasAnyData = rows.some((r) => r.avg3Month > 0);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleCopyForward = () => {
    startTransition(async () => {
      await copyBudgetForward(month, previousMonth);
      router.refresh();
    });
  };

  const handleInitAverages = () => {
    startTransition(async () => {
      await initFromAverages(month);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {hasBudget ? (
        <>
          <BudgetSummaryStrip summary={summary} homeCurrency={homeCurrency} />

          <BudgetCategoryList
            rows={rows}
            month={month}
            readOnly={readOnly}
            homeCurrency={homeCurrency}
          />

          {aiEnabled && (
            <BudgetInsightsPanel month={month} hasBudget={hasBudget} />
          )}
        </>
      ) : (
        <>
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Set up your budget for {formatMonth(month)}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                Create spending targets for each category to track your monthly
                expenses. You can start from scratch, copy last month&apos;s
                budget, or use your spending history as a guide.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                {hasPreviousMonth && (
                  <Button
                    variant="outline"
                    onClick={handleCopyForward}
                    disabled={pending}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy from {formatMonth(previousMonth)}
                  </Button>
                )}
                {hasAnyData && (
                  <Button
                    variant="outline"
                    onClick={handleInitAverages}
                    disabled={pending}
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Start from 3-month averages
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Show the category list anyway so users can set targets manually */}
          <BudgetCategoryList
            rows={rows}
            month={month}
            readOnly={readOnly}
            homeCurrency={homeCurrency}
          />
        </>
      )}
    </div>
  );
}
