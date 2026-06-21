export type CategoryType = "income" | "expense" | "transfer" | "savings";

/** 50/30/20 bucket on main groups; subs inherit via parent. */
export type BudgetRuleBucket = "needs" | "wants" | "savings" | "none";

export type Category = {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  parentId: number | null;
  type: CategoryType;
  budgetRuleBucket: BudgetRuleBucket | null;
  isSystem: boolean;
  createdAt: number;
};

export type AccountGroup = {
  id: number;
  name: string;
  color: string;
  createdAt: number;
};

export type Account = {
  id: number;
  name: string;
  bankProfileId: number | null;
  groupId: number | null;
  currency: string;
  color: string;
  /** When true and `groupId` is set, `color` is user-chosen; otherwise it follows the group. */
  colorCustom: boolean;
  createdAt: number;
};

export type BankProfile = {
  id: number;
  name: string;
  dateColumn: string;
  descriptionColumn: string;
  amountColumn: string | null;
  debitColumn: string | null;
  creditColumn: string | null;
  dateFormat: string;
  skipRows: number;
  delimiter: string;
  negativeIsDebit: boolean;
  extraMappings: string | null;
  isSystem: boolean;
  createdAt: number;
};

export type Transaction = {
  id: number;
  accountId: number;
  importBatchId: number | null;
  fingerprint: string;
  date: string; // YYYY-MM-DD
  description: string;
  normalised: string;
  amount: number; // negative=debit, positive=credit
  originalAmount: number | null;
  originalCurrency: string | null;
  categoryId: number | null;
  categorySource: "rule" | "ai" | "manual" | null;
  confidence: number | null;
  notes: string | null;
  tags: string; // JSON array
  isManual: boolean;
  categoryConfirmed: boolean;
  linkedTransactionId: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TransactionWithRelations = Transaction & {
  category: Category | null;
  account: Account;
};

export type ImportBatch = {
  id: number;
  accountId: number;
  filename: string;
  importedAt: number;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  status: "pending" | "completed" | "failed";
};

export type CategorisationRule = {
  id: number;
  categoryId: number;
  pattern: string;
  patternType: "regex" | "keyword" | "exact";
  priority: number;
  confidence: number;
  isUserDefined: boolean;
  createdAt: number;
  updatedAt: number;
};

/** AI / bulk rule creation before persisting to `categorisation_rules`. */
export type RuleDraftInput = {
  pattern: string;
  categoryId: number;
  patternType: "regex" | "keyword" | "exact";
};

export type ParsedRow = {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  rawRow: Record<string, string>;
  merchant?: string;
  accountReference?: string;
  pending?: boolean;
};

export type ImportPreview = {
  accountId: number;
  filename: string;
  rows: PreviewRow[];
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  mergeCount: number;
  dateRangeStart: string;
  dateRangeEnd: string;
};

export type PreviewRowStatus = "new" | "duplicate" | "merge";

export type PreviewRow = ParsedRow & {
  normalised: string;
  fingerprint: string;
  status: PreviewRowStatus;
  isDuplicate: boolean;
  mergeTargetId?: number;
};

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type ScheduledTransaction = {
  id: number;
  name: string;
  internalName: string | null;
  displayName: string | null;
  amount: number;
  accountId: number | null;
  categoryId: number | null;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Occurrence = {
  date: string;
  scheduleId: number;
  name: string;
  amount: number;
  accountId: number | null;
  categoryId: number | null;
  categoryColor: string | null;
};

export type BalancePoint = {
  date: string;
  isoDate: string;
  balance: number;
  dayIncome: number;
  dayExpense: number;
};

export type Budget = {
  id: number;
  month: string;
  categoryId: number;
  targetAmount: number;
  createdAt: number;
  updatedAt: number;
};

export type BudgetMonthStatus = {
  month: string;
  isClosed: boolean;
  closedAt: number | null;
  reviewGeneratedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type BudgetCategoryKind = "expense" | "savings";

export type BudgetScheduledBreakdown = {
  scheduleId: number;
  name: string;
  frequency: ScheduledTransaction["frequency"];
  dates: string[];
  occurrenceCount: number;
  amount: number;
};

export type BudgetCategoryRow = {
  categoryId: number;
  categoryName: string;
  parentName: string;
  color: string;
  targetAmount: number;
  actualSpent: number;
  scheduledAmount: number;
  scheduledBreakdown: BudgetScheduledBreakdown[];
  avg3Month: number;
  categoryKind: BudgetCategoryKind;
  /** Resolved from parent main for 50/30/20 (null if not in a bucket). */
  ruleBucket: BudgetRuleBucket | null;
  /** Computed surplus line (not a DB category); `categoryId` is `BUDGET_SYNTHETIC_SURPLUS_CATEGORY_ID`. */
  isSyntheticSurplus?: boolean;
};

/** Sentinel id for the computed income-surplus budget row (no `budgets` row). */
export const BUDGET_SYNTHETIC_SURPLUS_CATEGORY_ID = 0;

export type BudgetRule502030Band = {
  targetTotal: number;
  actualTotal: number;
  guideline: number;
};

export type BudgetSummary = {
  /** Expense-category targets only (excludes savings goals). */
  totalBudgeted: number;
  /** Net expense outflows only (50/30 “Needs + Wants” spending). */
  totalSpent: number;
  totalRemaining: number;
  expectedIncome: number;
  /** Realised income from transactions (home currency) for the month. */
  actualIncome: number;
  /** Whether this month is marked closed in settings (final numbers / surplus rules). */
  monthClosed: boolean;
  /** Savings goal targets and net allocations (same sign convention as spending). */
  totalSavingsBudgeted: number;
  totalSavingsAllocated: number;
  /**
   * When the month is closed, positive surplus (income basis minus expense spend minus
   * tracked savings allocations) counted toward savings for reporting only.
   */
  implicitSurplusAsSavings: number;
  /** Income basis for 50/30/20 (scheduled vs realised — see UI note). */
  incomeBasis: number;
  rule502030: {
    needs: BudgetRule502030Band;
    wants: BudgetRule502030Band;
    savings: BudgetRule502030Band;
  };
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyBurnRate: number;
  allowedDailyRate: number;
  projectedSpend: number;
  /** Scheduled expense bills still due this month (occurrences after today, home currency). */
  scheduledRemaining: number;
  onTrack: boolean;
};

export type BudgetInsight = {
  type: "warning" | "suggestion" | "win";
  category?: string;
  message: string;
};

export type AiBudgetSuggestion = {
  categoryId: number;
  categoryName: string;
  suggestedAmount: number;
  reasoning: string;
  trend: "increasing" | "decreasing" | "stable" | "new";
};

export type AiBudgetSuggestionsResponse = {
  suggestions: AiBudgetSuggestion[];
  overallNotes: string;
};

export type BudgetGenerateAnalyticsRow = {
  categoryId: number;
  categoryName: string;
  parentName: string;
  color: string;
  currentMonthTarget: number;
  lastMonthTarget: number;
  lastMonthSpent: number;
  avg3Month: number;
  expectedSpend: number;
};

export type BudgetGenerateRecommendationRow = BudgetGenerateAnalyticsRow & {
  recommendedTarget: number;
  trend: "up" | "down" | "stable" | "new";
  aiInsight: string;
};

export type MonthlyTotal = {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  /** Net allocations to savings categories (positive = toward savings). */
  savings: number;
  net: number;
};

export type DailyNeedsWants = {
  /** ISO date (YYYY-MM-DD) for the day. */
  date: string;
  /** Day-of-month (1..31) for chart x-axis. */
  day: number;
  /** Cumulative income through this day; null for days after today. */
  income: number | null;
  /** Cumulative needs spending through this day; null for days after today. */
  needs: number | null;
  /** Cumulative wants spending through this day; null for days after today. */
  wants: number | null;
};

export type CategoryTotal = {
  categoryId: number | null;
  categoryName: string;
  color: string;
  total: number;
  count: number;
};

export type AccountCashflowRow = {
  accountId: number;
  accountName: string;
  color: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
};

/**
 * Single line for analytics category drill-down (home-currency).
 * For spending/savings drill-down, `converted` is a positive magnitude; for income, it may be signed.
 */
export type AnalyticsExpenseTransactionLine = {
  id: number;
  date: string;
  description: string;
  converted: number;
  accountName: string;
};

/** Budget drill-down: signed home-currency amounts (negative = out, positive = in). */
export type AnalyticsBudgetTransactionLine = {
  id: number;
  date: string;
  description: string;
  signedConverted: number;
  accountName: string;
};

/** Spending hierarchy for analytics (expense debits, transfers excluded). */
export type CategoryHierarchyNode = {
  id: number | null;
  name: string;
  color: string;
  total: number;
  transactionCount: number;
  children: CategoryHierarchyNode[];
};

export type AnalyticsTreemapDatum = {
  name: string;
  value: number;
  fill: string;
  categoryId: number | null;
  children?: AnalyticsTreemapDatum[];
};

export type AnalyticsSummary = {
  income: number;
  expenses: number;
  savings: number;
  /** Income minus expenses minus savings allocations. */
  net: number;
};
