export const dynamic = "force-dynamic";

import { eq, sql } from "drizzle-orm";
import { DollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { BudgetCalendar } from "@/components/budget/budget-calendar";
import { BudgetMonthPicker } from "@/components/budget/budget-month-picker";
import { CashFlowChart } from "@/components/budget/cash-flow-chart";
import { MonthlyBudgetTab } from "@/components/budget/monthly-budget-tab";
import { ScheduleList } from "@/components/budget/schedule-list";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBudgetCategoryLinesByCategoryForRange } from "@/lib/analytics/queries";
import { buildBalancePoints, generateOccurrences } from "@/lib/budget/generate";
import {
  convertOccurrencesToHomeCurrency,
  getTotalBalanceInHomeCurrency,
} from "@/lib/budget/home-currency-cashflow";
import {
  buildBudgetCategoryRows,
  buildBudgetSummary,
  getActualIncomeForMonth,
  getScheduledAmountsByCategory,
  hasBudgetTargets,
  isMonthClosed,
} from "@/lib/budget/queries";
import { filterAssignableCategories } from "@/lib/categories/assignable";
import { getHomeCurrency } from "@/lib/currency/home";
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
  formatCurrency,
  getCurrentMonth,
  getMonthRange,
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
  const homeCurrency = getHomeCurrency();
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

  const totalBalance = await getTotalBalanceInHomeCurrency(homeCurrency);

  const occurrencesRaw = generateOccurrences(schedulesWithColor, today, end90);
  const occurrences = await convertOccurrencesToHomeCurrency(
    occurrencesRaw,
    homeCurrency,
  );

  const balancePoints = buildBalancePoints(
    occurrences,
    totalBalance,
    today,
    end90,
  );

  const occ30 = occurrences.filter((o) => o.date <= end30);
  const income30 = occ30
    .filter((o) => o.amount > 0)
    .reduce((s, o) => s + o.amount, 0);
  const expense30 = occ30
    .filter((o) => o.amount < 0)
    .reduce((s, o) => s + Math.abs(o.amount), 0);
  const net30 = income30 - expense30;

  const budgetRows = await buildBudgetCategoryRows(
    selectedMonth,
    allCatsRaw,
    homeCurrency,
  );
  const { income: expectedIncome } = await getScheduledAmountsByCategory(
    selectedMonth,
    homeCurrency,
  );
  const actualIncome = await getActualIncomeForMonth(selectedMonth, homeCurrency);
  const monthClosed = isMonthClosed(selectedMonth);
  const budgetSummary = buildBudgetSummary(
    budgetRows,
    selectedMonth,
    expectedIncome,
    actualIncome,
    monthClosed,
  );
  const previousMonth = addCalendarMonths(selectedMonth, -1);
  const hasPrevBudget = hasBudgetTargets(previousMonth);
  const isReadOnly = selectedMonth < currentMonth;
  const canCloseMonth = selectedMonth < currentMonth && !monthClosed;

  const { start: monthRangeStart, end: monthRangeEnd } =
    getMonthRange(selectedMonth);
  const expenseTransactionsByCategory =
    await getBudgetCategoryLinesByCategoryForRange(
      monthRangeStart,
      monthRangeEnd,
      homeCurrency,
    );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Budget Planner"
        subtitle="Plan, track, and optimise your spending"
        actions={
          <BudgetMonthPicker
            selectedMonth={selectedMonth}
            minMonth={minMonth}
            maxMonth={maxMonth}
            monthOptions={monthOptions}
          />
        }
      />

      {/* Tabs */}
      <Tabs defaultValue="monthly-budget">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          <TabsList className="w-max">
            <TabsTrigger value="monthly-budget" className="px-2.5 sm:px-3">
              Monthly Budget
            </TabsTrigger>
            <TabsTrigger value="overview" className="px-2.5 sm:px-3">
              Cash Flow
            </TabsTrigger>
            <TabsTrigger value="calendar" className="px-2.5 sm:px-3">
              Calendar
            </TabsTrigger>
            <TabsTrigger value="schedules" className="px-2.5 sm:px-3">
              Schedules
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="monthly-budget" className="mt-4">
          <MonthlyBudgetTab
            month={selectedMonth}
            rows={budgetRows}
            summary={budgetSummary}
            hasPreviousMonth={hasPrevBudget}
            previousMonth={previousMonth}
            aiEnabled={aiEnabled}
            readOnly={isReadOnly}
            monthClosed={monthClosed}
            canCloseMonth={canCloseMonth}
            homeCurrency={homeCurrency}
            expenseTransactionsByCategory={expenseTransactionsByCategory}
            monthRangeStart={monthRangeStart}
            monthRangeEnd={monthRangeEnd}
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
                  {formatCurrency(income30, homeCurrency)}
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
                  {formatCurrency(expense30, homeCurrency)}
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
                  {net30 >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(net30), homeCurrency)}
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
                homeCurrency={homeCurrency}
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
                homeCurrency={homeCurrency}
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
            homeCurrency={homeCurrency}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
