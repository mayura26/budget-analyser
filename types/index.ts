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
  categoryId: number | null;
  categorySource: "rule" | "ai" | "manual" | null;
  confidence: number | null;
  notes: string | null;
  tags: string; // JSON array
  isManual: boolean;
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

export type ParsedRow = {
  date: string;
  description: string;
  amount: number;
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
