import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const bankProfiles = sqliteTable("bank_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  dateColumn: text("date_column").notNull(),
  descriptionColumn: text("description_column").notNull(),
  amountColumn: text("amount_column"),
  debitColumn: text("debit_column"),
  creditColumn: text("credit_column"),
  dateFormat: text("date_format").notNull(),
  skipRows: integer("skip_rows").notNull().default(0),
  delimiter: text("delimiter").notNull().default(","),
  negativeIsDebit: integer("negative_is_debit", { mode: "boolean" })
    .notNull()
    .default(true),
  extraMappings: text("extra_mappings"), // JSON
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const accountGroups = sqliteTable("account_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  bankProfileId: integer("bank_profile_id").references(() => bankProfiles.id),
  groupId: integer("group_id").references(() => accountGroups.id, {
    onDelete: "set null",
  }),
  currency: text("currency").notNull().default("AUD"),
  color: text("color").notNull().default("#6366f1"),
  colorCustom: integer("color_custom", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  icon: text("icon"),
  // FK to categories(id) enforced in migration (self-reference breaks Drizzle TS inference).
  parentId: integer("parent_id"),
  type: text("type", {
    enum: ["income", "expense", "transfer", "savings"],
  })
    .notNull()
    .default("expense"),
  /** 50/30/20 bucket for main groups only; subs inherit from parent. */
  budgetRuleBucket: text("budget_rule_bucket", {
    enum: ["needs", "wants", "savings", "none"],
  }),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

export const categorisationRules = sqliteTable("categorisation_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(),
  patternType: text("pattern_type", {
    enum: ["regex", "keyword", "exact"],
  })
    .notNull()
    .default("keyword"),
  priority: integer("priority").notNull().default(0),
  confidence: real("confidence").notNull().default(1.0),
  isUserDefined: integer("is_user_defined", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  importedAt: integer("imported_at").notNull().default(sql`(unixepoch())`),
  rowCount: integer("row_count").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  dateRangeStart: text("date_range_start"),
  dateRangeEnd: text("date_range_end"),
  status: text("status", { enum: ["pending", "completed", "failed"] })
    .notNull()
    .default("completed"),
});

export const scheduledTransactions = sqliteTable("scheduled_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  internalName: text("internal_name"),
  displayName: text("display_name"),
  amount: real("amount").notNull(),
  accountId: integer("account_id").references(() => accounts.id, {
    onDelete: "cascade",
  }),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  frequency: text("frequency", {
    enum: ["weekly", "fortnightly", "monthly", "quarterly", "yearly"],
  }).notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const mutedScheduleSuggestions = sqliteTable(
  "muted_schedule_suggestions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    signature: text("signature").notNull(),
    internalName: text("internal_name").notNull(),
    frequency: text("frequency", {
      enum: ["weekly", "fortnightly", "monthly", "quarterly", "yearly"],
    }).notNull(),
    amountRounded: real("amount_rounded").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("muted_schedule_suggestions_signature_unique").on(
      table.signature,
    ),
    index("muted_schedule_suggestions_internal_name_idx").on(
      table.internalName,
    ),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    importBatchId: integer("import_batch_id").references(
      () => importBatches.id,
      { onDelete: "set null" },
    ),
    fingerprint: text("fingerprint").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    description: text("description").notNull(),
    normalised: text("normalised").notNull(),
    amount: real("amount").notNull(), // negative=debit, positive=credit
    originalAmount: real("original_amount"),
    originalCurrency: text("original_currency"),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: text("category_source", {
      enum: ["rule", "ai", "manual"],
    }),
    confidence: real("confidence"),
    notes: text("notes"),
    tags: text("tags").default("[]"), // JSON array
    isManual: integer("is_manual", { mode: "boolean" })
      .notNull()
      .default(false),
    categoryConfirmed: integer("category_confirmed", { mode: "boolean" })
      .notNull()
      .default(true),
    linkedTransactionId: integer("linked_transaction_id"),
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    merchant: text("merchant"),
    accountReference: text("account_reference"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("transactions_account_fingerprint").on(
      table.accountId,
      table.fingerprint,
    ),
    index("transactions_date_idx").on(table.date),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_category_idx").on(table.categoryId),
    index("transactions_linked_idx").on(table.linkedTransactionId),
    index("transactions_account_pending_idx").on(
      table.accountId,
      table.pending,
    ),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(), // YYYY-MM
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    targetAmount: real("target_amount").notNull(), // Always positive (spending limit)
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("budgets_month_category").on(table.month, table.categoryId),
    index("budgets_month_idx").on(table.month),
  ],
);

export const budgetMonthStatus = sqliteTable(
  "budget_month_status",
  {
    month: text("month").primaryKey(), // YYYY-MM
    isClosed: integer("is_closed", { mode: "boolean" })
      .notNull()
      .default(false),
    closedAt: integer("closed_at"),
    reviewGeneratedAt: integer("review_generated_at"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [index("budget_month_status_closed_idx").on(table.isClosed)],
);

export const budgetMonthReviews = sqliteTable(
  "budget_month_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    month: text("month").notNull(), // YYYY-MM
    format: text("format").notNull(), // 'digest' | 'deep'
    reviewJson: text("review_json").notNull(),
    metricsJson: text("metrics_json").notNull(),
    model: text("model").notNull(),
    generatedAt: integer("generated_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("budget_month_reviews_month_format").on(
      table.month,
      table.format,
    ),
  ],
);

export const budgetReviewShares = sqliteTable(
  "budget_review_shares",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    token: text("token").notNull(),
    month: text("month").notNull(), // YYYY-MM
    format: text("format").notNull(), // 'digest' | 'deep'
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    uniqueIndex("budget_review_shares_token").on(table.token),
    index("budget_review_shares_month_format_idx").on(
      table.month,
      table.format,
    ),
  ],
);

export const dismissedMismatches = sqliteTable(
  "dismissed_mismatches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    normalised: text("normalised").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("dismissed_mismatches_unique").on(
      table.normalised,
      table.categoryId,
    ),
  ],
);

/** Cached FX: units of quote per one unit of base on rateDate (Frankfurter/ECB). */
export const fxRates = sqliteTable(
  "fx_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rateDate: text("rate_date").notNull(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: real("rate").notNull(),
    fetchedAt: integer("fetched_at").notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("fx_rates_date_base_quote").on(
      table.rateDate,
      table.baseCurrency,
      table.quoteCurrency,
    ),
  ],
);
