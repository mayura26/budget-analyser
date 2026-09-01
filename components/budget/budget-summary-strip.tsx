"use client";

import { ArrowUpCircle, Gauge, PiggyBank } from "lucide-react";
import {
  BudgetProgressBar,
  getBudgetStatus,
  statusTextClass,
} from "@/components/budget/budget-progress-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency, formatSignedCurrency } from "@/lib/utils";
import type { BudgetSummary } from "@/types";

export function BudgetSummaryStrip({
  summary,
  homeCurrency,
}: {
  summary: BudgetSummary;
  homeCurrency: SupportedCurrency;
}) {
  const pctExpenseUsed =
    summary.totalBudgeted > 0
      ? Math.round((summary.totalSpent / summary.totalBudgeted) * 100)
      : 0;

  const savingsIncludingSurplus =
    summary.totalSavingsAllocated + summary.implicitSurplusAsSavings;

  const pctSavings =
    summary.totalSavingsBudgeted > 0
      ? Math.round(
          (savingsIncludingSurplus / summary.totalSavingsBudgeted) * 100,
        )
      : 0;

  const incomeVariance = summary.actualIncome - summary.expectedIncome;
  const incomeMatchesExpected = Math.abs(incomeVariance) < 0.01;
  const incomeProgressPct =
    summary.expectedIncome > 0
      ? Math.max(
          0,
          Math.min((summary.actualIncome / summary.expectedIncome) * 100, 100),
        )
      : summary.actualIncome > 0
        ? 100
        : 0;
  const incomeGapLabel = incomeMatchesExpected
    ? "On expected"
    : incomeVariance > 0
      ? `+${formatCurrency(incomeVariance, homeCurrency)} over expected`
      : summary.monthClosed
        ? `${formatCurrency(Math.abs(incomeVariance), homeCurrency)} under expected`
        : `${formatCurrency(Math.abs(incomeVariance), homeCurrency)} still expected`;
  const incomeGapClass = incomeMatchesExpected
    ? "text-muted-foreground"
    : incomeVariance > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : summary.monthClosed
        ? "text-amber-600 dark:text-amber-400"
        : "text-sky-600 dark:text-sky-400";

  const spendStatus = getBudgetStatus(
    summary.totalSpent,
    summary.totalBudgeted,
    "default",
  );
  const saveStatus = getBudgetStatus(
    savingsIncludingSurplus,
    summary.totalSavingsBudgeted,
    "savings",
  );

  const expenseLeft = summary.totalBudgeted - summary.totalSpent;
  const savingsAhead = savingsIncludingSurplus - summary.totalSavingsBudgeted;

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
      {/* Income — left, compact */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Income
          </CardTitle>
          <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center">
            <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
        </CardHeader>
        <CardContent
          className="px-3 pt-0 pb-3 sm:px-6 sm:pb-6 space-y-3"
          data-testid="summary-income-card"
        >
          <div
            className="rounded-md border border-border/70 bg-muted/20 px-3 py-2"
            data-testid="summary-income-actual"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                Actual received
              </span>
              <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(summary.actualIncome, homeCurrency)}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                style={{ width: `${incomeProgressPct}%` }}
              />
            </div>
            <p
              className={cn(
                "mt-1.5 text-xs font-medium tabular-nums",
                incomeGapClass,
              )}
            >
              {incomeGapLabel}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Expected income
            </p>
            <p className="mt-0.5 text-xl sm:text-2xl font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(summary.expectedIncome, homeCurrency)}
            </p>
            <p className="text-xs text-muted-foreground">
              From scheduled income
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Progress — right, wide. Stacks Spending + Saving with goal-line bars. */}
      <Card className="lg:col-span-2">
        <CardContent className="p-3 sm:p-6 space-y-5">
          {/* Spending */}
          <div data-testid="summary-spending-progress">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <Gauge className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                </div>
                <span className="text-sm font-medium">Spending</span>
              </div>
              <div className="flex items-baseline gap-2 tabular-nums whitespace-nowrap text-sm">
                <span
                  className={cn(
                    "font-semibold",
                    summary.totalSpent < -0.005
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground",
                  )}
                >
                  {formatSignedCurrency(summary.totalSpent, homeCurrency)}
                </span>
                <span className="text-muted-foreground/60">/</span>
                <span className="text-muted-foreground">
                  {formatCurrency(summary.totalBudgeted, homeCurrency)}
                </span>
                <span
                  className={cn(
                    "ml-1 font-semibold",
                    statusTextClass(spendStatus),
                  )}
                >
                  {pctExpenseUsed}%
                </span>
              </div>
            </div>
            <BudgetProgressBar
              spent={summary.totalSpent}
              target={summary.totalBudgeted}
              size="lg"
              variant="default"
            />
            <div className="flex items-center justify-between gap-3 mt-1.5 text-xs text-muted-foreground tabular-nums">
              {summary.totalBudgeted > 0 ? (
                <span>
                  <span
                    className={
                      expenseLeft >= 0
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : "text-red-600 dark:text-red-400 font-medium"
                    }
                  >
                    {expenseLeft >= 0 ? "" : "−"}
                    {formatCurrency(Math.abs(expenseLeft), homeCurrency)}
                  </span>{" "}
                  {expenseLeft >= 0 ? "left" : "over"} &middot; needs &amp;
                  wants
                </span>
              ) : (
                <span>No expense budget set</span>
              )}
              {summary.totalBudgeted > 0 && summary.daysRemaining > 0 ? (
                <span className="text-right">
                  {formatCurrency(summary.dailyBurnRate, homeCurrency)}/day
                  &middot;{" "}
                  <span
                    className={cn(
                      "font-medium",
                      summary.onTrack
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {summary.onTrack ? "on track" : "over pace"}
                  </span>{" "}
                  &middot; {summary.daysRemaining}d left
                </span>
              ) : null}
            </div>
          </div>

          {/* Saving */}
          <div data-testid="summary-saving-progress">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <PiggyBank className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-sm font-medium">Saving</span>
              </div>
              <div className="flex items-baseline gap-2 tabular-nums whitespace-nowrap text-sm">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {formatCurrency(savingsIncludingSurplus, homeCurrency)}
                </span>
                <span className="text-muted-foreground/60">/</span>
                <span className="text-muted-foreground">
                  {formatCurrency(summary.totalSavingsBudgeted, homeCurrency)}
                </span>
                <span
                  className={cn(
                    "ml-1 font-semibold",
                    statusTextClass(saveStatus),
                  )}
                >
                  {pctSavings}%
                </span>
              </div>
            </div>
            <BudgetProgressBar
              spent={savingsIncludingSurplus}
              target={summary.totalSavingsBudgeted}
              size="lg"
              variant="savings"
            />
            <div className="flex items-center justify-between gap-3 mt-1.5 text-xs text-muted-foreground tabular-nums">
              {summary.totalSavingsBudgeted > 0 ? (
                <span>
                  {savingsAhead >= 0 ? (
                    <>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        +{formatCurrency(savingsAhead, homeCurrency)}
                      </span>{" "}
                      over goal
                    </>
                  ) : (
                    <>
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {formatCurrency(Math.abs(savingsAhead), homeCurrency)}
                      </span>{" "}
                      to goal
                    </>
                  )}
                </span>
              ) : (
                <span>No savings targets set</span>
              )}
              {summary.implicitSurplusAsSavings > 0 ? (
                <span className="text-right">
                  Includes{" "}
                  {formatCurrency(
                    summary.implicitSurplusAsSavings,
                    homeCurrency,
                  )}{" "}
                  surplus
                </span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
