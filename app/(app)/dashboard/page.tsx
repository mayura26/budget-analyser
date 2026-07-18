export const dynamic = "force-dynamic";

import { sql } from "drizzle-orm";
import { Target } from "lucide-react";
import Link from "next/link";
import { BudgetProgressBar } from "@/components/budget/budget-progress-bar";
import { BudgetRule502030Compact } from "@/components/budget/budget-rule-502030-strip";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { DashboardLineChart } from "@/components/dashboard/dashboard-line-chart";
import { DashboardMonthPicker } from "@/components/dashboard/dashboard-month-picker";
import { MoneyFlowSankey } from "@/components/dashboard/money-flow-sankey";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getActualIncomeForMonth,
  getRemainingScheduledByCategory,
  getScheduledAmountsByCategory,
  hasBudgetTargets,
  isMonthClosed,
} from "@/lib/budget/queries";
import { getHomeCurrency } from "@/lib/currency/home";
import {
  getCategoryBreakdownInHomeCurrency,
  getDailyNeedsWantsForMonth,
  getMonthlyTotalsInHomeCurrency,
  getRuleBucketTotalsForMonth,
} from "@/lib/dashboard/home-currency-totals";
import { db } from "@/lib/db";
import { categories, transactions } from "@/lib/db/schema";
import {
  enumerateMonthsInclusive,
  formatCurrency,
  formatMonth,
  getCurrentMonth,
  getMonthRange,
  getMonthsEndingAt,
  parseMonthParam,
} from "@/lib/utils";
import type { BudgetCategoryRow, BudgetSummary, Category } from "@/types";

function getEarliestTransactionMonth(): string | null {
  const row = db
    .select({ d: sql<string>`MIN(${transactions.date})` })
    .from(transactions)
    .get();
  if (!row?.d) return null;
  return row.d.slice(0, 7);
}

function DashboardBudgetStatus({
  selectedMonth,
  rows,
  summary,
  homeCurrency,
}: {
  selectedMonth: string;
  rows: BudgetCategoryRow[];
  summary: BudgetSummary;
  homeCurrency: ReturnType<typeof getHomeCurrency>;
}) {
  const budgetedRows = rows.filter(
    (r) => r.targetAmount > 0 && r.categoryKind === "expense",
  );
  const topCategories = [...budgetedRows]
    .sort(
      (a, b) => b.actualSpent / b.targetAmount - a.actualSpent / a.targetAmount,
    )
    .slice(0, 3);

  const pctUsed =
    summary.totalBudgeted > 0
      ? Math.round((summary.totalSpent / summary.totalBudgeted) * 100)
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Budget Status
        </CardTitle>
        <Link
          href={`/budget?month=${selectedMonth}`}
          className="text-xs text-primary hover:underline"
        >
          View full budget
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span>
              {formatCurrency(summary.totalSpent, homeCurrency)} of{" "}
              {formatCurrency(summary.totalBudgeted, homeCurrency)} spent
            </span>
            <span
              className={
                summary.onTrack
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {pctUsed}%
            </span>
          </div>
          <BudgetProgressBar
            spent={summary.totalSpent}
            target={summary.totalBudgeted}
          />
        </div>

        {summary.monthClosed && (
          <p className="text-xs text-muted-foreground">
            Income: {formatCurrency(summary.actualIncome, homeCurrency)}{" "}
            realised · {formatCurrency(summary.expectedIncome, homeCurrency)}{" "}
            expected (scheduled)
          </p>
        )}

        {topCategories.length > 0 && (
          <div className="space-y-1.5">
            {topCategories.map((row) => {
              const catPct =
                row.targetAmount > 0
                  ? Math.round((row.actualSpent / row.targetAmount) * 100)
                  : 0;
              return (
                <div
                  key={row.categoryId}
                  className="flex flex-col gap-1.5 text-xs sm:flex-row sm:items-center sm:gap-2"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <div
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="wrap-break-word min-w-0 flex-1 leading-snug">
                      {row.categoryName}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-3 pl-6 sm:pl-0">
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(row.actualSpent, homeCurrency)} /{" "}
                      {formatCurrency(row.targetAmount, homeCurrency)}
                    </span>
                    <span
                      className={`tabular-nums w-8 text-right ${
                        catPct > 100
                          ? "text-red-600 dark:text-red-400"
                          : catPct >= 75
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {catPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function loadBudgetData(
  selectedMonth: string,
  homeCurrency: ReturnType<typeof getHomeCurrency>,
): Promise<{ rows: BudgetCategoryRow[]; summary: BudgetSummary } | null> {
  if (!hasBudgetTargets(selectedMonth)) return null;

  const allCats = db.select().from(categories).all() as Category[];
  const rows = await buildBudgetCategoryRows(
    selectedMonth,
    allCats,
    homeCurrency,
  );
  const { income } = await getScheduledAmountsByCategory(
    selectedMonth,
    homeCurrency,
  );
  const actualIncome = await getActualIncomeForMonth(
    selectedMonth,
    homeCurrency,
  );
  const scheduledRemaining = await getRemainingScheduledByCategory(
    selectedMonth,
    homeCurrency,
  );
  const summary = buildBudgetSummary(
    rows,
    selectedMonth,
    income,
    actualIncome,
    isMonthClosed(selectedMonth),
    scheduledRemaining,
  );
  return { rows, summary };
}

function DashboardBudgetSection({
  selectedMonth,
  rows,
  summary,
  homeCurrency,
}: {
  selectedMonth: string;
  rows: BudgetCategoryRow[];
  summary: BudgetSummary;
  homeCurrency: ReturnType<typeof getHomeCurrency>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DashboardBudgetStatus
        selectedMonth={selectedMonth}
        rows={rows}
        summary={summary}
        homeCurrency={homeCurrency}
      />
      <BudgetRule502030Compact
        summary={summary}
        homeCurrency={homeCurrency}
        href={`/budget?month=${selectedMonth}`}
      />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const homeCurrency = getHomeCurrency();
  const maxMonth = getCurrentMonth();
  const earliest = getEarliestTransactionMonth();
  const minMonth = earliest
    ? earliest < maxMonth
      ? earliest
      : maxMonth
    : maxMonth;

  const selectedMonth = parseMonthParam(params.month, minMonth, maxMonth);
  const months = getMonthsEndingAt(selectedMonth, 6);
  const { start, end } = getMonthRange(selectedMonth);

  const monthlyTotals = await getMonthlyTotalsInHomeCurrency(
    months,
    homeCurrency,
  );
  const dailyNeedsWants = await getDailyNeedsWantsForMonth(
    selectedMonth,
    homeCurrency,
  );
  const budgetData = await loadBudgetData(selectedMonth, homeCurrency);
  const currentMonthData = monthlyTotals.find(
    (m) => m.month === selectedMonth,
  ) ?? {
    month: selectedMonth,
    income: 0,
    expenses: 0,
    savings: 0,
    net: 0,
  };

  // Full-month needs/wants split for the money-flow graphic. Uses the whole month
  // (not the today-capped daily series) so it reconciles with the expense total:
  // "Other" = expenses with no 50/30/20 bucket.
  const { needs: monthNeeds, wants: monthWants } =
    await getRuleBucketTotalsForMonth(selectedMonth, homeCurrency);
  const otherExpenses = Math.max(
    0,
    currentMonthData.expenses - monthNeeds - monthWants,
  );

  const monthOptions = enumerateMonthsInclusive(minMonth, maxMonth);

  const { expenseTotals } = await getCategoryBreakdownInHomeCurrency(
    start,
    end,
    homeCurrency,
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Summary and category breakdown for ${formatMonth(selectedMonth)}`}
        actions={
          <DashboardMonthPicker
            selectedMonth={selectedMonth}
            minMonth={minMonth}
            maxMonth={maxMonth}
            monthOptions={monthOptions}
          />
        }
      />

      {/* Money flow — income splitting into needs / wants / savings / net */}
      <MoneyFlowSankey
        income={currentMonthData.income}
        needs={monthNeeds}
        wants={monthWants}
        other={otherExpenses}
        savings={currentMonthData.savings}
        net={currentMonthData.net}
        homeCurrency={homeCurrency}
      />

      {/* Budget + 50/30/20 */}
      {budgetData && (
        <DashboardBudgetSection
          selectedMonth={selectedMonth}
          rows={budgetData.rows}
          summary={budgetData.summary}
          homeCurrency={homeCurrency}
        />
      )}

      {/* Charts */}
      <DashboardCharts
        monthlyTotals={monthlyTotals}
        categoryExpenseTotals={expenseTotals}
        monthNet={currentMonthData.net}
        monthSavings={currentMonthData.savings}
        homeCurrency={homeCurrency}
      />

      {/* Needs / Wants / Income line chart */}
      <DashboardLineChart
        daily={dailyNeedsWants}
        homeCurrency={homeCurrency}
        incomeTarget={budgetData?.summary.expectedIncome}
        needsTarget={budgetData?.summary.rule502030.needs.targetTotal}
        wantsTarget={budgetData?.summary.rule502030.wants.targetTotal}
      />
    </div>
  );
}
