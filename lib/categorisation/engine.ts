import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  categorisationRules,
  settings,
  transactions,
} from "@/lib/db/schema";
import type { CategorisationRule, Category } from "@/types";
import { categoriseWithAI } from "./ai-client";
import { findMatchingRule } from "./rule-matcher";

const AI_BATCH_SIZE = 50;

export async function categoriseTransactions(
  transactionIds: number[],
): Promise<void> {
  if (transactionIds.length === 0) return;

  // Load rules sorted by priority DESC
  const rules = db
    .select()
    .from(categorisationRules)
    .orderBy(desc(categorisationRules.priority))
    .all() as CategorisationRule[];

  // Load all categories
  const allCategories = db.select().from(categories).all() as Category[];

  // Load transactions
  const txns = db
    .select()
    .from(transactions)
    .where(inArray(transactions.id, transactionIds))
    .all();

  const uncategorised: typeof txns = [];

  // Phase 1: Rule-based matching
  for (const txn of txns) {
    const match = findMatchingRule(txn.normalised, rules);
    if (match) {
      db.update(transactions)
        .set({
          categoryId: match.categoryId,
          categorySource: "rule",
          confidence: match.confidence,
          categoryConfirmed: false,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(transactions.id, txn.id))
        .run();
    } else {
      uncategorised.push(txn);
    }
  }

  // Phase 2: AI categorisation for remaining
  if (uncategorised.length === 0) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  const modelSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_model"))
    .get();

  const model = modelSetting?.value ?? "gpt-4o-mini";

  // Process in batches
  for (let i = 0; i < uncategorised.length; i += AI_BATCH_SIZE) {
    const batch = uncategorised.slice(i, i + AI_BATCH_SIZE);
    try {
      const results = await categoriseWithAI(
        batch.map((t) => ({
          id: t.id,
          normalised: t.normalised,
          amount: t.amount,
          date: t.date,
        })),
        allCategories,
        apiKey,
        model,
      );

      for (const result of results) {
        if (result.categoryId) {
          db.update(transactions)
            .set({
              categoryId: result.categoryId,
              categorySource: "ai",
              confidence: result.confidence,
              categoryConfirmed: false,
              updatedAt: Math.floor(Date.now() / 1000),
            })
            .where(eq(transactions.id, result.transactionId))
            .run();
        }
      }
    } catch (err) {
      console.error("AI categorisation failed:", err);
    }
  }
}
