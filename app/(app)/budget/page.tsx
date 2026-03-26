export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { scheduledTransactions, accounts, categories, transactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateOccurrences, buildBalancePoints } from "@/lib/budget/generate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleList } from "@/components/budget/schedule-list";
import { BudgetCalendar } from "@/components/budget/budget-calendar";
import { CashFlowChart } from "@/components/budget/cash-flow-chart";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function BudgetPage() {
  const today = new Date().toISOString().slice(0, 10);
  const end90 = addDays(today, 90);
  const end30 = addDays(today, 30);

  const allAccounts = db.select().from(accounts).all();
  const allCategories = db.select().from(categories).all();

  const categoryColorMap = new Map(allCategories.map((c) => [c.id, c.color]));

  const rawSchedules = db.select().from(scheduledTransactions).all();

  const schedulesWithColor = rawSchedules.map((s) => ({
    ...s,
    categoryColor: s.categoryId ? (categoryColorMap.get(s.categoryId) ?? null) : null,
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

  const totalBalance = balanceRows.reduce((sum, r) => sum + (r.balance ?? 0), 0);

  // Generate occurrences for 90 days
  const occurrences = generateOccurrences(schedulesWithColor, today, end90);

  // Build balance points for chart
  const balancePoints = buildBalancePoints(occurrences, totalBalance, today, end90);

  // 30-day summary
  const occ30 = occurrences.filter((o) => o.date <= end30);
  const income30 = occ30.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0);
  const expense30 = occ30.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0);
  const net30 = income30 - expense30;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Budget Planner</h1>
        <p className="text-muted-foreground text-sm">Forecast your cash flow</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expected Income
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-green-600">
              ${income30.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Next 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expected Expenses
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-red-600">
              ${expense30.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Next 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected Net
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-semibold ${net30 >= 0 ? "text-green-600" : "text-red-600"}`}>
              {net30 >= 0 ? "+" : "-"}$
              {Math.abs(net30).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Next 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <CashFlowChart points={balancePoints} currentBalance={totalBalance} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <BudgetCalendar occurrences={occurrences} accounts={allAccounts} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="mt-4">
          <ScheduleList
            schedules={rawSchedules}
            accounts={allAccounts}
            categories={allCategories}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
