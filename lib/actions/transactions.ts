"use server";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assignableCategoryError,
  filterAssignableCategories,
  isAssignableCategoryId,
} from "@/lib/categories/assignable";
import { categoriseWithAI } from "@/lib/categorisation/ai-client";
import { categoriseTransactions } from "@/lib/categorisation/engine";
import {
  findMatchingRule,
  keywordRuleStub,
  matchRule,
} from "@/lib/categorisation/rule-matcher";
import { db } from "@/lib/db";
import {
  accounts,
  categories,
  categorisationRules,
  settings,
  transactions,
} from "@/lib/db/schema";
import { generateFingerprint } from "@/lib/import/fingerprint";
import { normaliseDescription } from "@/lib/import/normaliser";
import type { ActionResult, CategorisationRule, Category } from "@/types";

export type AISuggestionScope = "uncategorised" | "unfinalised";

export type SuggestionRow = {
  transactionId: number;
  date: string;
  description: string;
  normalised: string;
  amount: number;
  accountName: string;
  /** Present when the row already had a category (e.g. re-suggesting unconfirmed). */
  currentCategoryId: number | null;
  currentCategoryName: string | null;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string;
  source: "rule" | "ai" | "none";
  confidence: number;
};

const ManualTransactionSchema = z.object({
  accountId: z.coerce.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
  amount: z.coerce.number(),
  categoryId: z.coerce.number().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(), // comma-separated
});

export async function createManualTransaction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ id: number }>> {
  const parsed = ManualTransactionSchema.safeParse({
    accountId: formData.get("accountId"),
    date: formData.get("date"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId") || undefined,
    notes: formData.get("notes") || undefined,
    tags: formData.get("tags") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const { accountId, date, description, amount, categoryId, notes, tags } =
    parsed.data;
  const catErr = assignableCategoryError(categoryId);
  if (catErr) {
    return { success: false, error: catErr };
  }
  const normalised = normaliseDescription(description);
  const fingerprint = generateFingerprint(accountId, date, amount, normalised);
  const tagsArray = tags
    ? tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  try {
    const result = db
      .insert(transactions)
      .values({
        accountId,
        date,
        description,
        normalised,
        fingerprint,
        amount,
        categoryId: categoryId ?? null,
        categorySource: categoryId ? "manual" : null,
        notes: notes ?? null,
        tags: JSON.stringify(tagsArray),
        isManual: true,
        categoryConfirmed: Boolean(categoryId),
      })
      .returning({ id: transactions.id })
      .get();

    if (!categoryId) {
      await categoriseTransactions([result.id]);
    }

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: { id: result.id } };
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes("UNIQUE")) {
      return {
        success: false,
        error: "A transaction with the same details already exists",
      };
    }
    throw err;
  }
}

export async function updateTransactionCategory(
  transactionId: number,
  categoryId: number | null,
  createRule = false,
): Promise<ActionResult> {
  const txn = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get();
  if (!txn) return { success: false, error: "Transaction not found" };

  const catErr = assignableCategoryError(categoryId);
  if (catErr) {
    return { success: false, error: catErr };
  }

  const now = Math.floor(Date.now() / 1000);
  const categoryUpdate = {
    categoryId,
    categorySource: "manual" as const,
    confidence: 1.0,
    categoryConfirmed: false,
    updatedAt: now,
  };

  db.update(transactions)
    .set(categoryUpdate)
    .where(eq(transactions.id, transactionId))
    .run();

  if (txn.linkedTransactionId) {
    db.update(transactions)
      .set(categoryUpdate)
      .where(eq(transactions.id, txn.linkedTransactionId))
      .run();
  }

  if (createRule && categoryId) {
    // Create a keyword rule from the first meaningful token
    const tokens = txn.normalised.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length > 0) {
      const pattern = tokens[0];
      db.insert(categorisationRules)
        .values({
          categoryId,
          pattern,
          patternType: "keyword",
          priority: 10,
          confidence: 0.9,
          isUserDefined: true,
        })
        .run();
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function setTransactionCategoryConfirmed(
  transactionId: number,
  confirmed: boolean,
): Promise<ActionResult> {
  const txn = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .get();
  if (!txn) return { success: false, error: "Transaction not found" };
  if (txn.categoryId === null && confirmed) {
    return { success: false, error: "Cannot confirm without a category" };
  }

  const now = Math.floor(Date.now() / 1000);
  db.update(transactions)
    .set({
      categoryConfirmed: confirmed,
      updatedAt: now,
    })
    .where(eq(transactions.id, transactionId))
    .run();

  if (txn.linkedTransactionId) {
    db.update(transactions)
      .set({
        categoryConfirmed: confirmed,
        updatedAt: now,
      })
      .where(eq(transactions.id, txn.linkedTransactionId))
      .run();
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  const txn = db
    .select({ linkedTransactionId: transactions.linkedTransactionId })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  const now = Math.floor(Date.now() / 1000);
  if (txn?.linkedTransactionId) {
    db.update(transactions)
      .set({ linkedTransactionId: null, updatedAt: now })
      .where(eq(transactions.id, txn.linkedTransactionId))
      .run();
  }
  db.delete(transactions).where(eq(transactions.id, id)).run();
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function recategoriseUncategorised(): Promise<
  ActionResult<{ count: number }>
> {
  const uncategorised = db
    .select({ id: transactions.id })
    .from(transactions)
    .where(isNull(transactions.categoryId))
    .all();

  const ids = uncategorised.map((t) => t.id);
  if (ids.length === 0) return { success: true, data: { count: 0 } };

  await categoriseTransactions(ids);

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: { count: ids.length } };
}

export async function getAISuggestions(
  scope: AISuggestionScope = "uncategorised",
): Promise<ActionResult<SuggestionRow[]>> {
  const whereClause =
    scope === "unfinalised"
      ? eq(transactions.categoryConfirmed, false)
      : isNull(transactions.categoryId);

  const candidates = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      normalised: transactions.normalised,
      amount: transactions.amount,
      accountId: transactions.accountId,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
      currentCategoryId: transactions.categoryId,
      currentCategoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause)
    .all();

  if (candidates.length === 0) return { success: true, data: [] };

  const allRules = db
    .select()
    .from(categorisationRules)
    .orderBy(desc(categorisationRules.priority))
    .all() as CategorisationRule[];

  const allCategories = db.select().from(categories).all() as Category[];
  const categoryMap = new Map(allCategories.map((c) => [c.id, c.name]));
  const assignableForAi = filterAssignableCategories(allCategories);

  const suggestions: SuggestionRow[] = [];
  const needsAI: typeof candidates = [];

  const rowMeta = (txn: (typeof candidates)[number]) => ({
    currentCategoryId: txn.currentCategoryId ?? null,
    currentCategoryName: txn.currentCategoryName ?? null,
  });

  // Phase 1: rule-based (read-only, no DB write)
  for (const txn of candidates) {
    const match = findMatchingRule(txn.normalised, allRules);
    if (match) {
      suggestions.push({
        transactionId: txn.id,
        date: txn.date,
        description: txn.description,
        normalised: txn.normalised,
        amount: txn.amount,
        accountName: txn.accountName,
        ...rowMeta(txn),
        suggestedCategoryId: match.categoryId,
        suggestedCategoryName: categoryMap.get(match.categoryId) ?? "Unknown",
        source: "rule",
        confidence: match.confidence,
      });
    } else {
      needsAI.push(txn);
    }
  }

  // Phase 2: AI for remainder — enabled if OPENAI_API_KEY is present
  if (needsAI.length > 0) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      const modelSetting = db
        .select()
        .from(settings)
        .where(eq(settings.key, "openai_model"))
        .get();
      const model = modelSetting?.value ?? "gpt-4o-mini";

      try {
        const aiResults = await categoriseWithAI(
          needsAI.map((t) => ({
            id: t.id,
            normalised: t.normalised,
            amount: t.amount,
            date: t.date,
            accountName: t.accountName,
          })),
          assignableForAi,
          apiKey,
          model,
        );

        const aiMap = new Map(aiResults.map((r) => [r.transactionId, r]));

        for (const txn of needsAI) {
          const ai = aiMap.get(txn.id);
          const aiCat =
            ai?.categoryId != null && isAssignableCategoryId(ai.categoryId)
              ? ai.categoryId
              : null;
          suggestions.push({
            transactionId: txn.id,
            date: txn.date,
            description: txn.description,
            normalised: txn.normalised,
            amount: txn.amount,
            accountName: txn.accountName,
            ...rowMeta(txn),
            suggestedCategoryId: aiCat,
            suggestedCategoryName: ai?.categoryName ?? "Not processed",
            source: aiCat ? "ai" : "none",
            confidence: ai?.confidence ?? 0,
          });
        }
      } catch (err) {
        console.error("AI suggestions failed:", err);
        for (const txn of needsAI) {
          suggestions.push({
            transactionId: txn.id,
            date: txn.date,
            description: txn.description,
            normalised: txn.normalised,
            amount: txn.amount,
            accountName: txn.accountName,
            ...rowMeta(txn),
            suggestedCategoryId: null,
            suggestedCategoryName: "Not processed",
            source: "none",
            confidence: 0,
          });
        }
      }
    } else {
      for (const txn of needsAI) {
        suggestions.push({
          transactionId: txn.id,
          date: txn.date,
          description: txn.description,
          normalised: txn.normalised,
          amount: txn.amount,
          accountName: txn.accountName,
          ...rowMeta(txn),
          suggestedCategoryId: null,
          suggestedCategoryName: "Not processed",
          source: "none",
          confidence: 0,
        });
      }
    }
  }

  return { success: true, data: suggestions };
}

export async function applyCategorisations(
  updates: {
    transactionId: number;
    categoryId: number;
    source: "rule" | "ai" | "none";
    /** When false, category is saved but not marked verified. Defaults to true. */
    confirm?: boolean;
  }[],
): Promise<ActionResult<{ applied: number }>> {
  const now = Math.floor(Date.now() / 1000);
  let applied = 0;

  for (const u of updates) {
    const err = assignableCategoryError(u.categoryId);
    if (err) {
      return { success: false, error: err };
    }
  }

  for (const u of updates) {
    const row = db
      .select({ linkedTransactionId: transactions.linkedTransactionId })
      .from(transactions)
      .where(eq(transactions.id, u.transactionId))
      .get();

    const batchUpdate = {
      categoryId: u.categoryId,
      categorySource: u.source === "none" ? ("manual" as const) : u.source,
      categoryConfirmed: u.confirm !== false,
      updatedAt: now,
    };

    db.update(transactions)
      .set(batchUpdate)
      .where(eq(transactions.id, u.transactionId))
      .run();

    if (row?.linkedTransactionId) {
      db.update(transactions)
        .set(batchUpdate)
        .where(eq(transactions.id, row.linkedTransactionId))
        .run();
    }
    applied++;
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: { applied } };
}

export async function applyKeywordRulesToUnverifiedTransactions(
  rules: { pattern: string; categoryId: number }[],
): Promise<ActionResult<{ updated: number }>> {
  if (rules.length === 0) return { success: true, data: { updated: 0 } };

  for (const r of rules) {
    const err = assignableCategoryError(r.categoryId);
    if (err) return { success: false, error: err };
  }

  const now = Math.floor(Date.now() / 1000);
  const rows = db
    .select({
      id: transactions.id,
      normalised: transactions.normalised,
      linkedTransactionId: transactions.linkedTransactionId,
    })
    .from(transactions)
    .where(eq(transactions.categoryConfirmed, false))
    .all();

  const updatedIds = new Set<number>();
  let updated = 0;

  for (const row of rows) {
    if (updatedIds.has(row.id)) continue;

    const rule = rules.find((r) =>
      matchRule(row.normalised, keywordRuleStub(r.pattern, r.categoryId)),
    );
    if (!rule) continue;

    const batchUpdate = {
      categoryId: rule.categoryId,
      categorySource: "rule" as const,
      categoryConfirmed: true,
      updatedAt: now,
    };

    db.update(transactions)
      .set(batchUpdate)
      .where(eq(transactions.id, row.id))
      .run();
    updatedIds.add(row.id);
    updated++;

    if (row.linkedTransactionId) {
      db.update(transactions)
        .set(batchUpdate)
        .where(eq(transactions.id, row.linkedTransactionId))
        .run();
      updatedIds.add(row.linkedTransactionId);
      updated++;
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: { updated } };
}

export type UncategorisedTransaction = {
  id: number;
  date: string;
  description: string;
  normalised: string;
  amount: number;
  accountName: string;
};

export async function getUncategorisedTransactions(): Promise<
  ActionResult<UncategorisedTransaction[]>
> {
  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      normalised: transactions.normalised,
      amount: transactions.amount,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(isNull(transactions.categoryId))
    .orderBy(sql`${transactions.date} DESC`)
    .limit(200)
    .all();

  return { success: true, data: rows };
}

export type TransferCandidate = {
  transactionId: number;
  date: string;
  description: string;
  amount: number;
  accountId: number;
  accountName: string;
  sameGroup: boolean;
};

export async function findTransferCandidates(
  transactionId: number,
): Promise<ActionResult<TransferCandidate[]>> {
  const source = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      accountId: transactions.accountId,
      groupId: accounts.groupId,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.id, transactionId))
    .get();

  if (!source) return { success: false, error: "Transaction not found" };

  // Find transactions with matching absolute amount, opposite sign, within ±2 days, different account, not already linked
  const candidates = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      accountId: transactions.accountId,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
      groupId: accounts.groupId,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        ne(transactions.accountId, source.accountId),
        isNull(transactions.linkedTransactionId),
        sql`ABS(${transactions.amount}) = ABS(${source.amount})`,
        sql`SIGN(${transactions.amount}) != SIGN(${source.amount})`,
        sql`julianday(${transactions.date}) BETWEEN julianday(${source.date}) - 2 AND julianday(${source.date}) + 2`,
      ),
    )
    .limit(10)
    .all();

  const result: TransferCandidate[] = candidates.map((c) => ({
    transactionId: c.id,
    date: c.date,
    description: c.description,
    amount: c.amount,
    accountId: c.accountId,
    accountName: c.accountName,
    sameGroup:
      source.groupId !== null &&
      c.groupId !== null &&
      source.groupId === c.groupId,
  }));

  // Sort same-group candidates first
  result.sort((a, b) => (b.sameGroup ? 1 : 0) - (a.sameGroup ? 1 : 0));

  return { success: true, data: result };
}

export async function linkTransactions(
  idA: number,
  idB: number,
): Promise<ActionResult> {
  if (idA === idB) {
    return { success: false, error: "Cannot link a transaction to itself" };
  }

  const now = Math.floor(Date.now() / 1000);

  const rowA = db
    .select({
      linkedTransactionId: transactions.linkedTransactionId,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      categoryConfirmed: transactions.categoryConfirmed,
    })
    .from(transactions)
    .where(eq(transactions.id, idA))
    .get();

  const rowB = db
    .select({
      linkedTransactionId: transactions.linkedTransactionId,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      categoryConfirmed: transactions.categoryConfirmed,
    })
    .from(transactions)
    .where(eq(transactions.id, idB))
    .get();

  if (!rowA || !rowB) {
    return { success: false, error: "Transaction not found" };
  }

  // Break old pairs so no third row keeps a stale pointer to A or B
  if (rowA.linkedTransactionId && rowA.linkedTransactionId !== idB) {
    db.update(transactions)
      .set({ linkedTransactionId: null, updatedAt: now })
      .where(eq(transactions.id, rowA.linkedTransactionId))
      .run();
  }
  if (rowB.linkedTransactionId && rowB.linkedTransactionId !== idA) {
    db.update(transactions)
      .set({ linkedTransactionId: null, updatedAt: now })
      .where(eq(transactions.id, rowB.linkedTransactionId))
      .run();
  }

  db.update(transactions)
    .set({ linkedTransactionId: idB, updatedAt: now })
    .where(eq(transactions.id, idA))
    .run();
  db.update(transactions)
    .set({ linkedTransactionId: idA, updatedAt: now })
    .where(eq(transactions.id, idB))
    .run();

  const mergedCategoryId = rowA.categoryId ?? rowB.categoryId ?? null;
  if (mergedCategoryId != null) {
    const preferA = rowA.categoryId != null;
    const mergedSource =
      (preferA ? rowA.categorySource : rowB.categorySource) ?? "manual";
    const mergedConfirmed = preferA
      ? rowA.categoryConfirmed
      : rowB.categoryConfirmed;
    const alignPair = {
      categoryId: mergedCategoryId,
      categorySource: mergedSource,
      confidence: 1.0,
      categoryConfirmed: mergedConfirmed,
      updatedAt: now,
    };
    db.update(transactions)
      .set(alignPair)
      .where(eq(transactions.id, idA))
      .run();
    db.update(transactions)
      .set(alignPair)
      .where(eq(transactions.id, idB))
      .run();
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}

export async function unlinkTransaction(id: number): Promise<ActionResult> {
  const txn = db
    .select({ linkedTransactionId: transactions.linkedTransactionId })
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();

  if (!txn) return { success: false, error: "Transaction not found" };

  const now = Math.floor(Date.now() / 1000);
  db.update(transactions)
    .set({ linkedTransactionId: null, updatedAt: now })
    .where(eq(transactions.id, id))
    .run();

  if (txn.linkedTransactionId) {
    db.update(transactions)
      .set({ linkedTransactionId: null, updatedAt: now })
      .where(eq(transactions.id, txn.linkedTransactionId))
      .run();
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { success: true, data: undefined };
}
