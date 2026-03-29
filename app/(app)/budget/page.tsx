export const dynamic = "force-dynamic";

import { eq, sql } from "drizzle-orm";
import { DollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { BudgetCalendar } from "@/components/budget/budget-calendar";
import { BudgetMonthPicker } from "@/components/budget/budget-month-picker";
import { CashFlowChart } from "@/components/budget/cash-flow-chart";
import { MonthlyBudgetTab } from "@/components/budget/monthly-budget-tab";
import { ScheduleList } from "@/components/budget/schedule-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildBalancePoints,
  generateOccurrences,
} from "@/lib/budget/generate";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getScheduledAmountsByCategory,
  hasBudgetTargets,
} from "@/lib/budget/queries";
import { filterAssignableCategories } from "@/lib/categories/assignable";
import { db } from "@/lib/db";
import {
  accounts,
  categories,
  scheduledTransactions,
  settings,
  transactions,
} from "@/lib/db/schema";
import {
  addCalendarMonths,
  enumerateMonthsInclusive,
  formatMonth,
  getCurrentMonth,
  parseMonthParam,
} from "@/lib/utils";
import type { Category } from "@/types";

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getEarliestTransactionMonth(): string | null {
  const row = db
    .select({ d: sql<string>`MIN(${transactions.date})` })
    .from(transactions)
    .get();
  if (!row?.d) return null;
  return row.d.slice(0, 7);
}

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = getCurrentMonth();
  // Allow one month into the future for budget planning
  const maxMonth = addCalendarMonths(currentMonth, 1);
  const earliest = getEarliestTransactionMonth();
  const minMonth = earliest
    ? earliest < currentMonth
      ? earliest
      : currentMonth
    : currentMonth;

  const selectedMonth = parseMonthParam(params.month, minMonth, maxMonth);
  const monthOptions = enumerateMonthsInclusive(minMonth, maxMonth);

  const end90 = addDays(today, 90);
  const end30 = addDays(today, 30);

  const allAccounts = db.select().from(accounts).all();
  const allCatsRaw = db.select().from(categories).all() as Category[];
  const categoryMains = allCatsRaw
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const allCategories = filterAssignableCategories(allCatsRaw);

  const aiEnabledSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai_enabled"))
    .get();
  const aiEnabled = aiEnabledSetting?.value === "true";

  const categoryColorMap = new Map(allCatsRaw.map((c) => [c.id, c.color]));

  const rawSchedules = db.select().from(scheduledTransactions).all();

  const schedulesWithColor = rawSchedules.map((s) => ({
    ...s,
    categoryColor: s.categoryId
      ? (categoryColorMap.get(s.categoryId) ?? null)
      : null,
  }));

  // Total balance across all accounts
  const balanceRows = db
    .select({
      accountId: transactions.accountId,
      balance: sql<number>`SUM(${transactions.amount})`,
    })
    .from(transactions)
    .groupBy(transactions.accountId)
    .all();

  const totalBalance = balanceRows.reduce(
    (sum, r) => sum + (r.balance ?? 0),
    0,
  );

  // Generate occurrences for 90 days
  const occurrences = generateOccurrences(schedulesWithColor, today, end90);

  // Build balance points for chart
  const balancePoints = buildBalancePoints(
    occurrences,
    totalBalance,
    today,
    end90,
  );

  // 30-day summary
  const occ30 = occurrences.filter((o) => o.date <= end30);
  const income30 = occ30
    .filter((o) => o.amount > 0)
    .reduce((s, o) => s + o.amount, 0);
  const expense30 = occ30
    .filter((o) => o.amount < 0)
    .reduce((s, o) => s + Math.abs(o.amount), 0);
  const net30 = income30 - expense30;

  // Monthly budget data
  const budgetRows = buildBudgetCategoryRows(selectedMonth, allCatsRaw);
  const { income: expectedIncome } =
    getScheduledAmountsByCategory(selectedMonth);
  const budgetSummary = buildBudgetSummary(
    budgetRows,
    selectedMonth,
    expectedIncome,
  );
  const previousMonth = addCalendarMonths(selectedMonth, -1);
  const hasPrevBudget = hasBudgetTargets(previousMonth);
  const isReadOnly = selectedMonth < currentMonth;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Budget Planner</h1>
          <p className="text-muted-foreground text-sm">
            Plan, track, and optimise your spending
          </p>
        </div>
        <BudgetMonthPicker
          selectedMonth={selectedMonth}
          minMonth={minMonth}
          maxMonth={maxMonth}
          monthOptions={monthOptions}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monthly-budget">
        <TabsList>
          <TabsTrigger value="monthly-budget">Monthly Budget</TabsTrigger>
          <TabsTrigger value="overview">Cash Flow</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly-budget" className="mt-4">
          <MonthlyBudgetTab
            month={selectedMonth}
            rows={budgetRows}
            summary={budgetSummary}
            hasPreviousMonth={hasPrevBudget}
            previousMonth={previousMonth}
            aiEnabled={aiEnabled}
            readOnly={isReadOnly}
          />
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          {/* Summary strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Expected Income
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
                <p className="text-xl sm:text-2xl font-semibold text-green-600">
                  $
                  {income30.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Next 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Expected Expenses
                </CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
                <p className="text-xl sm:text-2xl font-semibold text-red-600">
                  $
                  {expense30.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Next 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-6 sm:pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Projected Net
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="px-3 pt-0 pb-2 sm:px-6 sm:pb-6">
                <p
                  className={`text-xl sm:text-2xl font-semibold ${net30 >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {net30 >= 0 ? "+" : "-"}$
                  {Math.abs(net30).toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">Next 30 days</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <CashFlowChart
                points={balancePoints}
                currentBalance={totalBalance}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <BudgetCalendar
                occurrences={occurrences}
                accounts={allAccounts}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <ScheduleList
            schedules={rawSchedules}
            accounts={allAccounts}
            categories={allCategories}
            categoryMains={categoryMains}
            aiEnabled={aiEnabled}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
