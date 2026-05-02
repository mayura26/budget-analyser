"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gauge,
  PiggyBank,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { formatCurrency } from "@/lib/utils";
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

  const pctSavings =
    summary.totalSavingsBudgeted > 0
      ? Math.round(
          (summary.totalSavingsAllocated / summary.totalSavingsBudgeted) * 100,
        )
      : 0;

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expected Income
          </CardTitle>
          <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center">
            <ArrowUpCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
          <p className="text-xl sm:text-2xl font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(summary.expectedIncome, homeCurrency)}
          </p>
          <p className="text-xs text-muted-foreground">From scheduled income</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Expense budget
          </CardTitle>
          <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
          <p className="text-xl sm:text-2xl font-semibold">
            {formatCurrency(summary.totalBudgeted, homeCurrency)}
          </p>
          <p className="text-xs text-muted-foreground">
            Needs &amp; wants targets only
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Savings goals
          </CardTitle>
          <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <PiggyBank className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
          <p className="text-xl sm:text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(summary.totalSavingsAllocated, homeCurrency)}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / {formatCurrency(summary.totalSavingsBudgeted, homeCurrency)}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.totalSavingsBudgeted > 0
              ? `${pctSavings}% of savings targets`
              : "No savings targets set"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Spent (needs &amp; wants)
          </CardTitle>
          <div className="h-9 w-9 rounded-full bg-red-500/10 flex items-center justify-center">
            <ArrowDownCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
          <p className="text-xl sm:text-2xl font-semibold text-red-600 dark:text-red-400">
            {formatCurrency(summary.totalSpent, homeCurrency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {pctExpenseUsed}% of expense budget used
          </p>
        </CardContent>
      </Card>

      <Card className="col-span-2 lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Daily pace
          </CardTitle>
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center ${
              summary.onTrack ? "bg-green-500/10" : "bg-red-500/10"
            }`}
          >
            <Gauge
              className={`h-4 w-4 ${
                summary.onTrack
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            />
          </div>
        </CardHeader>
        <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
          <p
            className={`text-xl sm:text-2xl font-semibold ${
              summary.onTrack
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {formatCurrency(summary.dailyBurnRate, homeCurrency)}
            <span className="text-sm font-normal text-muted-foreground">
              /day
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.onTrack ? "On track" : "Over pace"} &middot;{" "}
            {formatCurrency(summary.allowedDailyRate, homeCurrency)}/day allowed
            &middot; {summary.daysRemaining}d left
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
