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

function nonTransferFilter() {
  return or(isNull(categories.type), ne(categories.type, "transfer"));
}

type LoadedRow = {
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
};

async function loadConvertedRows(
  start: string,
  end: string,
  homeCurrency: SupportedCurrency,
): Promise<LoadedRow[]> {
  const rows = db
    .select({
      amount: transactions.amount,
      date: transactions.date,
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
    };
  });
}

function aggregateSummary(loaded: LoadedRow[]): AnalyticsSummary {
  let income = 0;
  let expenses = 0;
  for (const r of loaded) {
    const v = r.converted;
    if (v > 0) income += v;
    else expenses += Math.abs(v);
  }
  return {
    income: roundMoney(income),
    expenses: roundMoney(expenses),
    net: roundMoney(income - expenses),
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
  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const m of monthKeys) {
    byMonth.set(m, { income: 0, expenses: 0 });
  }
  for (const r of loaded) {
    const m = r.date.slice(0, 7);
    const b = byMonth.get(m);
    if (!b) continue;
    const v = r.converted;
    if (v > 0) b.income += v;
    else b.expenses += Math.abs(v);
  }
  return monthKeys.map((month) => {
    const b = byMonth.get(month) ?? { income: 0, expenses: 0 };
    return {
      month,
      income: roundMoney(b.income),
      expenses: roundMoney(b.expenses),
      net: roundMoney(b.income - b.expenses),
    };
  });
}

function isExpenseDebit(row: LoadedRow): boolean {
  if (row.converted >= 0) return false;
  if (row.categoryType === "transfer") return false;
  return true;
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

export type AnalyticsPageData = {
  summary: AnalyticsSummary;
  accounts: AccountCashflowRow[];
  monthly: MonthlyTotal[];
  categoryRoots: CategoryHierarchyNode[];
  treemapData: AnalyticsTreemapDatum | null;
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
  return {
    summary,
    accounts,
    monthly,
    categoryRoots: roots,
    treemapData,
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
