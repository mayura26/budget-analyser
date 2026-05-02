"use client";

import { CalendarClock, CheckCircle2, Copy, Sparkles, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AiBudgetSuggestionsDialog } from "@/components/budget/ai-budget-suggestions-dialog";
import { BudgetCategoryList } from "@/components/budget/budget-category-list";
import { GenerateBudgetDialog } from "@/components/budget/generate-budget-dialog";
import { BudgetInsightsPanel } from "@/components/budget/budget-insights-panel";
import { BudgetRule502030Strip } from "@/components/budget/budget-rule-502030-strip";
import { BudgetSummaryStrip } from "@/components/budget/budget-summary-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  closeBudgetMonthAction,
  copyBudgetForward,
  initFromAverages,
} from "@/lib/actions/budget-targets";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatMonth } from "@/lib/utils";
import type {
  AnalyticsBudgetTransactionLine,
  AnalyticsExpenseTransactionLine,
  BudgetCategoryRow,
  BudgetSummary,
} from "@/types";

export function MonthlyBudgetTab({
  month,
  rows,
  summary,
  hasPreviousMonth,
  previousMonth,
  aiEnabled,
  readOnly,
  monthClosed,
  canCloseMonth,
  homeCurrency,
  expenseTransactionsByCategory,
  monthRangeStart,
  monthRangeEnd,
}: {
  month: string;
  rows: BudgetCategoryRow[];
  summary: BudgetSummary;
  hasPreviousMonth: boolean;
  previousMonth: string;
  aiEnabled: boolean;
  readOnly: boolean;
  monthClosed: boolean;
  canCloseMonth: boolean;
  homeCurrency: SupportedCurrency;
  expenseTransactionsByCategory?:
    | Record<string, AnalyticsBudgetTransactionLine[]>
    | undefined;
  monthRangeStart: string;
  monthRangeEnd: string;
}) {
  const hasBudget = rows.some((r) => r.targetAmount > 0);
  const hasAnyData = rows.some((r) => r.avg3Month > 0);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

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

  const handleCloseMonth = () => {
    startTransition(async () => {
      await closeBudgetMonthAction(month);
      router.refresh();
    });
  };

  const handleReviewMonth = () => {
    router.push(`/budget/review?month=${month}`);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {hasBudget ? (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleReviewMonth}
              disabled={!monthClosed}
              title={
                monthClosed
                  ? "Open end-of-month AI review"
                  : "Close this month to unlock review"
              }
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Review Month
            </Button>
            <Button
              variant="outline"
              onClick={handleCloseMonth}
              disabled={pending || !canCloseMonth}
              title={
                canCloseMonth
                  ? "Close this month for final review"
                  : monthClosed
                    ? "Month already closed"
                    : "Only completed months can be closed"
              }
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {monthClosed ? "Month Closed" : "Close Month"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(true)}
              disabled={pending}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Budget
            </Button>
          </div>

          <BudgetSummaryStrip summary={summary} homeCurrency={homeCurrency} />

          <BudgetRule502030Strip summary={summary} homeCurrency={homeCurrency} />

          <BudgetCategoryList
            rows={rows}
            month={month}
            readOnly={readOnly}
            homeCurrency={homeCurrency}
            expenseTransactionsByCategory={expenseTransactionsByCategory}
            monthRangeStart={monthRangeStart}
            monthRangeEnd={monthRangeEnd}
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
                <Button
                  variant="outline"
                  onClick={handleReviewMonth}
                  disabled={!monthClosed}
                  title={
                    monthClosed
                      ? "Open end-of-month AI review"
                      : "Close this month to unlock review"
                  }
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Review Month
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCloseMonth}
                  disabled={pending || !canCloseMonth}
                  title={
                    canCloseMonth
                      ? "Close this month for final review"
                      : monthClosed
                        ? "Month already closed"
                        : "Only completed months can be closed"
                  }
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {monthClosed ? "Month Closed" : "Close Month"}
                </Button>
                <Button
                  variant="default"
                  onClick={() => setShowGenerateDialog(true)}
                  disabled={pending}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Budget
                </Button>
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
                {aiEnabled && hasAnyData && (
                  <Button
                    variant="outline"
                    onClick={() => setShowAiDialog(true)}
                    disabled={pending}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    AI-suggested budget
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
            expenseTransactionsByCategory={expenseTransactionsByCategory}
            monthRangeStart={monthRangeStart}
            monthRangeEnd={monthRangeEnd}
          />

          <AiBudgetSuggestionsDialog
            month={month}
            open={showAiDialog}
            onClose={() => setShowAiDialog(false)}
            homeCurrency={homeCurrency}
          />
        </>
      )}
      <GenerateBudgetDialog
        month={month}
        open={showGenerateDialog}
        onClose={() => setShowGenerateDialog(false)}
        homeCurrency={homeCurrency}
      />
    </div>
  );
}
