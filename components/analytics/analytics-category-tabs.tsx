"use client";

import { useState } from "react";
import { AnalyticsCategoryExplorer } from "@/components/analytics/analytics-category-explorer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SupportedCurrency } from "@/lib/currency/supported";
import type {
  AnalyticsExpenseTransactionLine,
  CategoryHierarchyNode,
} from "@/types";

type TabKey = "spending" | "income" | "savings";

type TxnsByCategory = Record<string, AnalyticsExpenseTransactionLine[]>;

export function AnalyticsCategoryTabs({
  spendingRoots,
  incomeRoots,
  savingsRoots,
  spendingTransactionsByCategory,
  incomeTransactionsByCategory,
  savingsTransactionsByCategory,
  rangeStart,
  rangeEnd,
  homeCurrency,
}: {
  spendingRoots: CategoryHierarchyNode[];
  incomeRoots: CategoryHierarchyNode[];
  savingsRoots: CategoryHierarchyNode[];
  spendingTransactionsByCategory: TxnsByCategory;
  incomeTransactionsByCategory: TxnsByCategory;
  savingsTransactionsByCategory: TxnsByCategory;
  rangeStart: string;
  rangeEnd: string;
  homeCurrency: SupportedCurrency;
}) {
  const [tab, setTab] = useState<TabKey>("spending");

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabKey)}
      className="space-y-3"
    >
      <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
        <TabsTrigger value="spending">Spending</TabsTrigger>
        <TabsTrigger value="income">Income</TabsTrigger>
        <TabsTrigger value="savings">Savings</TabsTrigger>
      </TabsList>

      <TabsContent value="spending" className="mt-3">
        <AnalyticsCategoryExplorer
          title="Spending by category"
          description="Expense activity (net of refunds) in home currency; transfers excluded. Expand a category to see subcategories and transactions."
          categoryRoots={spendingRoots}
          expenseTransactionsByCategory={spendingTransactionsByCategory}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          homeCurrency={homeCurrency}
        />
      </TabsContent>

      <TabsContent value="income" className="mt-3">
        <AnalyticsCategoryExplorer
          variant="income"
          title="Income by category"
          description="Income in home currency by category; uncategorised inflows appear under Not processed. Expand to see transactions (amounts may be negative for reversals)."
          categoryRoots={incomeRoots}
          expenseTransactionsByCategory={incomeTransactionsByCategory}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          homeCurrency={homeCurrency}
        />
      </TabsContent>

      <TabsContent value="savings" className="mt-3">
        <AnalyticsCategoryExplorer
          title="Savings & investments"
          description="Net allocations to savings categories (debits minus credits)."
          categoryRoots={savingsRoots}
          expenseTransactionsByCategory={savingsTransactionsByCategory}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          homeCurrency={homeCurrency}
        />
      </TabsContent>
    </Tabs>
  );
}
