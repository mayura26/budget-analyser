import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
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
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const accountGroups = sqliteTable("account_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
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
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  icon: text("icon"),
  // FK to categories(id) enforced in migration (self-reference breaks Drizzle TS inference).
  parentId: integer("parent_id"),
  type: text("type", { enum: ["income", "expense", "transfer"] })
    .notNull()
    .default("expense"),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
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
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  importedAt: integer("imported_at")
    .notNull()
    .default(sql`(unixepoch())`),
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
  amount: real("amount").notNull(),
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
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

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    importBatchId: integer("import_batch_id").references(
      () => importBatches.id,
      { onDelete: "set null" }
    ),
    fingerprint: text("fingerprint").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    description: text("description").notNull(),
    normalised: text("normalised").notNull(),
    amount: real("amount").notNull(), // negative=debit, positive=credit
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: text("category_source", {
      enum: ["rule", "ai", "manual"],
    }),
    confidence: real("confidence"),
    notes: text("notes"),
    tags: text("tags").default("[]"), // JSON array
    isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false),
    categoryConfirmed: integer("category_confirmed", { mode: "boolean" })
      .notNull()
      .default(true),
    linkedTransactionId: integer("linked_transaction_id"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex("transactions_account_fingerprint").on(
      table.accountId,
      table.fingerprint
    ),
    index("transactions_date_idx").on(table.date),
    index("transactions_account_idx").on(table.accountId),
    index("transactions_category_idx").on(table.categoryId),
    index("transactions_linked_idx").on(table.linkedTransactionId),
  ]
);
