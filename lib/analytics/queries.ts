import { and, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import { monthsInDateRangeInclusive } from "@/lib/analytics/date-range";
import { buildTreemapDatumForNodes } from "@/lib/analytics/treemap-helpers";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { db } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import type {
  AccountCashflowRow,
  AnalyticsBudgetTransactionLine,
  AnalyticsExpenseTransactionLine,
  AnalyticsSummary,
  AnalyticsTreemapDatum,
  Category,
  CategoryHierarchyNode,
  MonthlyTotal,
} from "@/types";

type DirectSpend = { total: number; count: number };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function netOutflowFromSignedSum(signedSumConverted: number): number {
  return Math.max(0, -signedSumConverted);
}

function nonTransferFilter() {
  return or(isNull(categories.type), ne(categories.type, "transfer"));
}

type LoadedRow = {
  transactionId: number;
  amount: number;
  date: string;
  converted: number;
  accountId: number;
  accountName: string;
  accountColor: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryType: string | null;
  description: string;
};

async function loadConvertedRows(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<LoadedRow[]> {
  const rows = db
    .select({
      transactionId: transactions.id,
      amount: transactions.amount,
      date: transactions.date,
      description: transactions.description,
      currency: accounts.currency,
      accountId: accounts.id,
      accountName: accounts.name,
      accountColor: accounts.color,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryType: categories.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        gte(transactions.date, start),
        lte(transactions.date, end),
        nonTransferFilter(),
      ),
    )
    .all();

  await prefetchRatesToHome(
    db,
    rows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.currency, homeCurrency),
    })),
    homeCurrency,
  );

  return rows.map((r) => {
    const cur = parseAccountCurrency(r.currency, homeCurrency);
    const converted = convertToHome(db, r.amount, cur, homeCurrency, r.date);
    return {
      transactionId: r.transactionId,
      amount: r.amount,
      date: r.date,
      converted,
      accountId: r.accountId,
      accountName: r.accountName,
      accountColor: r.accountColor,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      categoryColor: r.categoryColor,
      categoryType: r.categoryType,
      description: r.description,
    };
  });
}

function aggregateSummary(loaded: LoadedRow[]): AnalyticsSummary {
  let income = 0;
  let expenses = 0;
  let savings = 0;
  for (const r of loaded) {
    const v = r.converted;
    const t = r.categoryType;
    if (t === "transfer") continue;
    if (t === "income") {
      income += v;
      continue;
    }
    if (t === "savings") {
      savings += -v;
      continue;
    }
    if (t === "expense") {
      expenses += -v;
      continue;
    }
    if (v > 0) income += v;
    else expenses += -v;
  }
  return {
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    savings: roundMoney(savings),
    net: roundMoney(income - expenses - savings),
  };
}

function aggregateAccounts(loaded: LoadedRow[]): AccountCashflowRow[] {
  const byAccount = new Map<
    number,
    { name: string; color: string; in: number; out: number }
  >();

  for (const r of loaded) {
    const v = r.converted;
    const cur = byAccount.get(r.accountId) ?? {
      name: r.accountName,
      color: r.accountColor,
      in: 0,
      out: 0,
    };
    if (v > 0) cur.in += v;
    else cur.out += Math.abs(v);
    byAccount.set(r.accountId, {
      ...cur,
      name: r.accountName,
      color: r.accountColor,
    });
  }

  return [...byAccount.entries()]
    .map(([accountId, v]) => ({
      accountId,
      accountName: v.name,
      color: v.color,
      moneyIn: roundMoney(v.in),
      moneyOut: roundMoney(v.out),
      net: roundMoney(v.in - v.out),
    }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName));
}

function aggregateMonthly(
  loaded: LoadedRow[],
  rangeStart: string,
  rangeEnd: string,
): MonthlyTotal[] {
  const monthKeys = monthsInDateRangeInclusive(rangeStart, rangeEnd);
  const byMonth = new Map<
    string,
    { income: number; expenses: number; savings: number }
  >();
  for (const m of monthKeys) {
    byMonth.set(m, { income: 0, expenses: 0, savings: 0 });
  }
  for (const r of loaded) {
    const m = r.date.slice(0, 7);
    const b = byMonth.get(m);
    if (!b) continue;
    const v = r.converted;
    const t = r.categoryType;
    if (t === "transfer") continue;
    if (t === "income") {
      b.income += v;
      continue;
    }
    if (t === "savings") {
      b.savings += -v;
      continue;
    }
    if (t === "expense") {
      b.expenses += -v;
      continue;
    }
    if (v > 0) b.income += v;
    else b.expenses += -v;
  }
  return monthKeys.map((month) => {
    const b = byMonth.get(month) ?? { income: 0, expenses: 0, savings: 0 };
    return {
      month,
      income: roundMoney(b.income),
      expenses: roundMoney(b.expenses),
      savings: roundMoney(b.savings),
      net: roundMoney(b.income - b.expenses - b.savings),
    };
  });
}

function isExpenseDebit(row: LoadedRow): boolean {
  if (row.converted >= 0) return false;
  if (row.categoryType === "transfer") return false;
  if (row.categoryType === "savings") return false;
  return true;
}

function categoryKey(categoryId: number | null): string {
  return categoryId === null ? "none" : String(categoryId);
}

/** Matches rows counted toward income in `aggregateSummary` (signed amounts). */
function incomeContribution(r: LoadedRow): number | null {
  const v = r.converted;
  const t = r.categoryType;
  if (t === "transfer") return null;
  if (t === "income") return v;
  if (t === "savings" || t === "expense") return null;
  if (v > 0) return v;
  return null;
}

function aggregateExpenseDebitsByCategory(
  loaded: LoadedRow[],
): Record<string, AnalyticsExpenseTransactionLine[]> {
  const buckets = new Map<string, AnalyticsExpenseTransactionLine[]>();

  for (const r of loaded) {
    if (!isExpenseDebit(r)) continue;
    const key = categoryKey(r.categoryId);
    const list = buckets.get(key) ?? [];
    list.push({
      id: r.transactionId,
      date: r.date,
      description: r.description,
      converted: roundMoney(Math.abs(r.converted)),
      accountName: r.accountName,
    });
    buckets.set(key, list);
  }

  const out: Record<string, AnalyticsExpenseTransactionLine[]> = {};
  for (const [key, list] of buckets) {
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });
    out[key] = list;
  }
  return out;
}

function buildCategoryHierarchy(loaded: LoadedRow[]): {
  roots: CategoryHierarchyNode[];
  treemapData: AnalyticsTreemapDatum | null;
} {
  const direct = new Map<number | null, DirectSpend>();

  for (const r of loaded) {
    if (!isExpenseDebit(r)) continue;
    const spend = Math.abs(r.converted);
    const key = r.categoryId;
    const ex = direct.get(key) ?? { total: 0, count: 0 };
    ex.total += spend;
    ex.count += 1;
    direct.set(key, ex);
  }

  const allCats = db.select().from(categories).all() as Category[];
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const childrenByParent = new Map<number | null, Category[]>();
  for (const c of allCats) {
    const p = c.parentId ?? null;
    const list = childrenByParent.get(p) ?? [];
    list.push(c);
    childrenByParent.set(p, list);
  }
  for (const [, list] of childrenByParent) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const memo = new Map<number | null, DirectSpend>();

  function subtreeTotals(id: number | null): DirectSpend {
    const cached = memo.get(id);
    if (cached) return cached;

    if (id === null) {
      const only = direct.get(null) ?? { total: 0, count: 0 };
      const merged = { total: roundMoney(only.total), count: only.count };
      memo.set(null, merged);
      return merged;
    }

    const base = direct.get(id) ?? { total: 0, count: 0 };
    let total = base.total;
    let count = base.count;
    const kids = (childrenByParent.get(id) ?? []).filter(
      (c) => c.type === "expense",
    );
    for (const ch of kids) {
      const sub = subtreeTotals(ch.id);
      total += sub.total;
      count += sub.count;
    }
    const merged = { total: roundMoney(total), count };
    memo.set(id, merged);
    return merged;
  }

  function nodeMeta(id: number | null): { name: string; color: string } {
    if (id === null) return { name: "Not processed", color: "#9ca3af" };
    const c = catById.get(id);
    return { name: c?.name ?? "Unknown", color: c?.color ?? "#9ca3af" };
  }

  function buildNode(id: number | null): CategoryHierarchyNode {
    const meta = nodeMeta(id);
    const kids =
      id === null
        ? []
        : (childrenByParent.get(id) ?? []).filter((c) => c.type === "expense");
    const childNodes = kids
      .map((c) => buildNode(c.id))
      .filter((n) => n.total > 0 || n.children.length > 0);
    const self = subtreeTotals(id);
    return {
      id,
      name: meta.name,
      color: meta.color,
      total: self.total,
      transactionCount: self.count,
      children: childNodes.sort((a, b) => b.total - a.total),
    };
  }

  const rootCategories = (childrenByParent.get(null) ?? []).filter(
    (c) => c.type === "expense",
  );

  const roots: CategoryHierarchyNode[] = [];

  for (const rc of rootCategories) {
    const node = buildNode(rc.id);
    if (node.total > 0 || node.children.length > 0) roots.push(node);
  }

  if ((direct.get(null)?.total ?? 0) > 0) {
    roots.push(buildNode(null));
  }

  roots.sort((a, b) => b.total - a.total);

  const treemapData = buildTreemapDatumForNodes(roots);

  return { roots, treemapData };
}

function buildIncomeHierarchy(loaded: LoadedRow[]): {
  roots: CategoryHierarchyNode[];
  treemapData: AnalyticsTreemapDatum | null;
} {
  const direct = new Map<number | null, DirectSpend>();

  for (const r of loaded) {
    const c = incomeContribution(r);
    if (c === null) continue;
    const key = r.categoryId;
    const ex = direct.get(key) ?? { total: 0, count: 0 };
    ex.total += c;
    ex.count += 1;
    direct.set(key, ex);
  }

  const allCats = db.select().from(categories).all() as Category[];
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const childrenByParent = new Map<number | null, Category[]>();
  for (const c of allCats) {
    const p = c.parentId ?? null;
    const list = childrenByParent.get(p) ?? [];
    list.push(c);
    childrenByParent.set(p, list);
  }
  for (const [, list] of childrenByParent) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const memo = new Map<number | null, DirectSpend>();

  function subtreeTotals(id: number | null): DirectSpend {
    const cached = memo.get(id);
    if (cached) return cached;

    if (id === null) {
      const only = direct.get(null) ?? { total: 0, count: 0 };
      const merged = { total: roundMoney(only.total), count: only.count };
      memo.set(null, merged);
      return merged;
    }

    const base = direct.get(id) ?? { total: 0, count: 0 };
    let total = base.total;
    let count = base.count;
    const kids = (childrenByParent.get(id) ?? []).filter(
      (c) => c.type === "income",
    );
    for (const ch of kids) {
      const sub = subtreeTotals(ch.id);
      total += sub.total;
      count += sub.count;
    }
    const merged = { total: roundMoney(total), count };
    memo.set(id, merged);
    return merged;
  }

  function nodeMeta(id: number | null): { name: string; color: string } {
    if (id === null) return { name: "Not processed", color: "#9ca3af" };
    const c = catById.get(id);
    return { name: c?.name ?? "Unknown", color: c?.color ?? "#9ca3af" };
  }

  function buildNode(id: number | null): CategoryHierarchyNode {
    const meta = nodeMeta(id);
    const kids =
      id === null
        ? []
        : (childrenByParent.get(id) ?? []).filter((c) => c.type === "income");
    const childNodes = kids
      .map((c) => buildNode(c.id))
      .filter((n) => n.total !== 0 || n.children.length > 0);
    const self = subtreeTotals(id);
    return {
      id,
      name: meta.name,
      color: meta.color,
      total: self.total,
      transactionCount: self.count,
      children: childNodes.sort((a, b) =>
        Math.abs(b.total) !== Math.abs(a.total)
          ? Math.abs(b.total) - Math.abs(a.total)
          : b.total - a.total,
      ),
    };
  }

  const rootCategories = (childrenByParent.get(null) ?? []).filter(
    (c) => c.type === "income",
  );

  const roots: CategoryHierarchyNode[] = [];

  for (const rc of rootCategories) {
    const node = buildNode(rc.id);
    if (node.total !== 0 || node.children.length > 0) roots.push(node);
  }

  if ((direct.get(null)?.total ?? 0) !== 0) {
    roots.push(buildNode(null));
  }

  roots.sort((a, b) =>
    Math.abs(b.total) !== Math.abs(a.total)
      ? Math.abs(b.total) - Math.abs(a.total)
      : b.total - a.total,
  );

  const treemapData = buildTreemapDatumForNodes(roots, {
    rootLabel: "Income",
    incomeStyle: true,
  });

  return { roots, treemapData };
}

function aggregateIncomeTransactionsByCategory(
  loaded: LoadedRow[],
): Record<string, AnalyticsExpenseTransactionLine[]> {
  const buckets = new Map<string, AnalyticsExpenseTransactionLine[]>();

  for (const r of loaded) {
    const c = incomeContribution(r);
    if (c === null) continue;
    const key = categoryKey(r.categoryId);
    const list = buckets.get(key) ?? [];
    list.push({
      id: r.transactionId,
      date: r.date,
      description: r.description,
      converted: roundMoney(c),
      accountName: r.accountName,
    });
    buckets.set(key, list);
  }

  const out: Record<string, AnalyticsExpenseTransactionLine[]> = {};
  for (const [key, list] of buckets) {
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });
    out[key] = list;
  }
  return out;
}

function buildSavingsHierarchy(loaded: LoadedRow[]): {
  roots: CategoryHierarchyNode[];
  treemapData: AnalyticsTreemapDatum | null;
} {
  const signedByCat = new Map<
    number | null,
    { signed: number; count: number }
  >();
  for (const r of loaded) {
    if (r.categoryType !== "savings") continue;
    const key = r.categoryId;
    const ex = signedByCat.get(key) ?? { signed: 0, count: 0 };
    ex.signed += r.converted;
    ex.count += 1;
    signedByCat.set(key, ex);
  }

  const direct = new Map<number | null, DirectSpend>();
  for (const [key, v] of signedByCat) {
    const net = netOutflowFromSignedSum(v.signed);
    direct.set(key, { total: roundMoney(net), count: v.count });
  }

  const allCats = db.select().from(categories).all() as Category[];
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const childrenByParent = new Map<number | null, Category[]>();
  for (const c of allCats) {
    const p = c.parentId ?? null;
    const list = childrenByParent.get(p) ?? [];
    list.push(c);
    childrenByParent.set(p, list);
  }
  for (const [, list] of childrenByParent) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const memo = new Map<number | null, DirectSpend>();

  function subtreeTotals(id: number | null): DirectSpend {
    const cached = memo.get(id);
    if (cached) return cached;

    if (id === null) {
      const only = direct.get(null) ?? { total: 0, count: 0 };
      const merged = { total: roundMoney(only.total), count: only.count };
      memo.set(null, merged);
      return merged;
    }

    const base = direct.get(id) ?? { total: 0, count: 0 };
    let total = base.total;
    let count = base.count;
    const kids = (childrenByParent.get(id) ?? []).filter(
      (c) => c.type === "savings",
    );
    for (const ch of kids) {
      const sub = subtreeTotals(ch.id);
      total += sub.total;
      count += sub.count;
    }
    const merged = { total: roundMoney(total), count };
    memo.set(id, merged);
    return merged;
  }

  function nodeMeta(id: number | null): { name: string; color: string } {
    if (id === null) return { name: "Not processed", color: "#9ca3af" };
    const c = catById.get(id);
    return { name: c?.name ?? "Unknown", color: c?.color ?? "#9ca3af" };
  }

  function buildNode(id: number | null): CategoryHierarchyNode {
    const meta = nodeMeta(id);
    const kids =
      id === null
        ? []
        : (childrenByParent.get(id) ?? []).filter((c) => c.type === "savings");
    const childNodes = kids
      .map((c) => buildNode(c.id))
      .filter((n) => n.total > 0 || n.children.length > 0);
    const self = subtreeTotals(id);
    return {
      id,
      name: meta.name,
      color: meta.color,
      total: self.total,
      transactionCount: self.count,
      children: childNodes.sort((a, b) => b.total - a.total),
    };
  }

  const rootCategories = (childrenByParent.get(null) ?? []).filter(
    (c) => c.type === "savings",
  );

  const roots: CategoryHierarchyNode[] = [];

  for (const rc of rootCategories) {
    const node = buildNode(rc.id);
    if (node.total > 0 || node.children.length > 0) roots.push(node);
  }

  if ((direct.get(null)?.total ?? 0) > 0) {
    roots.push(buildNode(null));
  }

  roots.sort((a, b) => b.total - a.total);

  const treemapData = buildTreemapDatumForNodes(roots);

  return { roots, treemapData };
}

function aggregateSavingsDebitsByCategory(
  loaded: LoadedRow[],
): Record<string, AnalyticsExpenseTransactionLine[]> {
  const buckets = new Map<string, AnalyticsExpenseTransactionLine[]>();

  for (const r of loaded) {
    if (r.categoryType !== "savings" || r.converted >= 0) continue;
    const key = categoryKey(r.categoryId);
    const list = buckets.get(key) ?? [];
    list.push({
      id: r.transactionId,
      date: r.date,
      description: r.description,
      converted: roundMoney(Math.abs(r.converted)),
      accountName: r.accountName,
    });
    buckets.set(key, list);
  }

  const out: Record<string, AnalyticsExpenseTransactionLine[]> = {};
  for (const [key, list] of buckets) {
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });
    out[key] = list;
  }
  return out;
}

function aggregateBudgetLinesByCategory(
  loaded: LoadedRow[],
): Record<string, AnalyticsBudgetTransactionLine[]> {
  const buckets = new Map<string, AnalyticsBudgetTransactionLine[]>();

  for (const r of loaded) {
    const t = r.categoryType;
    if (t !== "expense" && t !== "savings") continue;
    if (r.categoryId == null) continue;
    const key = categoryKey(r.categoryId);
    const list = buckets.get(key) ?? [];
    list.push({
      id: r.transactionId,
      date: r.date,
      description: r.description,
      signedConverted: roundMoney(r.converted),
      accountName: r.accountName,
    });
    buckets.set(key, list);
  }

  const out: Record<string, AnalyticsBudgetTransactionLine[]> = {};
  for (const [key, list] of buckets) {
    list.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });
    out[key] = list;
  }
  return out;
}

export type AnalyticsPageData = {
  summary: AnalyticsSummary;
  accounts: AccountCashflowRow[];
  monthly: MonthlyTotal[];
  categoryRoots: CategoryHierarchyNode[];
  treemapData: AnalyticsTreemapDatum | null;
  categorySavingsRoots: CategoryHierarchyNode[];
  savingsTreemapData: AnalyticsTreemapDatum | null;
  /** Expense debits grouped by category id (`"none"` for uncategorised). */
  expenseTransactionsByCategory: Record<
    string,
    AnalyticsExpenseTransactionLine[]
  >;
  savingsTransactionsByCategory: Record<
    string,
    AnalyticsExpenseTransactionLine[]
  >;
  categoryIncomeRoots: CategoryHierarchyNode[];
  /** Income credits/adjustments; `converted` may be negative (signed home currency). */
  incomeTransactionsByCategory: Record<
    string,
    AnalyticsExpenseTransactionLine[]
  >;
};

/** Single DB round-trip + FX prefetch for all analytics aggregates. */
export async function getAnalyticsPageData(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<AnalyticsPageData> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  const summary = aggregateSummary(loaded);
  const accounts = aggregateAccounts(loaded);
  const monthly = aggregateMonthly(loaded, start, end);
  const { roots, treemapData } = buildCategoryHierarchy(loaded);
  const { roots: savingsRoots, treemapData: savingsTreemapData } =
    buildSavingsHierarchy(loaded);
  const { roots: incomeRoots } = buildIncomeHierarchy(loaded);
  const expenseTransactionsByCategory =
    aggregateExpenseDebitsByCategory(loaded);
  const savingsTransactionsByCategory =
    aggregateSavingsDebitsByCategory(loaded);
  const incomeTransactionsByCategory =
    aggregateIncomeTransactionsByCategory(loaded);
  return {
    summary,
    accounts,
    monthly,
    categoryRoots: roots,
    treemapData,
    categorySavingsRoots: savingsRoots,
    savingsTreemapData,
    expenseTransactionsByCategory,
    savingsTransactionsByCategory,
    categoryIncomeRoots: incomeRoots,
    incomeTransactionsByCategory,
  };
}

export async function getAccountCashflowInHomeCurrency(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<AccountCashflowRow[]> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  return aggregateAccounts(loaded);
}

export async function getAnalyticsSummary(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<AnalyticsSummary> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  return aggregateSummary(loaded);
}

export async function getMonthlyTotalsForDateRange(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<MonthlyTotal[]> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  return aggregateMonthly(loaded, start, end);
}

export async function getCategorySpendingHierarchy(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<{
  roots: CategoryHierarchyNode[];
  treemapData: AnalyticsTreemapDatum | null;
}> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  return buildCategoryHierarchy(loaded);
}

/** Expense debits in home currency, grouped by category id (`"none"` for uncategorised). */
export async function getExpenseDebitLinesByCategoryForRange(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<Record<string, AnalyticsExpenseTransactionLine[]>> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  return aggregateExpenseDebitsByCategory(loaded);
}

/** Expense + savings categories: signed amounts for net budget drill-down. */
export async function getBudgetCategoryLinesByCategoryForRange(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<Record<string, AnalyticsBudgetTransactionLine[]>> {
  const loaded = await loadConvertedRows(start, end, homeCurrency);
  return aggregateBudgetLinesByCategory(loaded);
}
