export type Category = {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  parentId: number | null;
  type: "income" | "expense" | "transfer";
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
};

export type ImportPreview = {
  accountId: number;
  filename: string;
  rows: PreviewRow[];
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  dateRangeStart: string;
  dateRangeEnd: string;
};

export type PreviewRow = ParsedRow & {
  normalised: string;
  fingerprint: string;
  isDuplicate: boolean;
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

export type BudgetCategoryRow = {
  categoryId: number;
  categoryName: string;
  parentName: string;
  color: string;
  targetAmount: number;
  actualSpent: number;
  scheduledAmount: number;
  avg3Month: number;
};

export type BudgetSummary = {
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  expectedIncome: number;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyBurnRate: number;
  allowedDailyRate: number;
  projectedSpend: number;
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

export type MonthlyTotal = {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
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

/** Single expense line for analytics category drill-down (home-currency amount). */
export type AnalyticsExpenseTransactionLine = {
  id: number;
  date: string;
  description: string;
  converted: number;
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
  net: number;
};
