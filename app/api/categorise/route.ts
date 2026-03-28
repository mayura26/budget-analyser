import { eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  filterAssignableCategories,
  isAssignableCategoryId,
} from "@/lib/categories/assignable";
import { categoriseWithAI } from "@/lib/categorisation/ai-client";
import { db } from "@/lib/db";
import { categories, settings, transactions } from "@/lib/db/schema";
import type { Category } from "@/types";

const RequestSchema = z.object({
  transactionIds: z.array(z.number()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const aiEnabledSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "ai_enabled"))
    .get();

  if (aiEnabledSetting?.value !== "true") {
    return NextResponse.json({ error: "AI not enabled" }, { status: 400 });
  }

  const apiKeySetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_api_key"))
    .get();

  const apiKey = process.env.OPENAI_API_KEY ?? apiKeySetting?.value;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured" },
      { status: 400 },
    );
  }

  const modelSetting = db
    .select()
    .from(settings)
    .where(eq(settings.key, "openai_model"))
    .get();

  const model = modelSetting?.value ?? "gpt-4o-mini";

  const txns = db
    .select()
    .from(transactions)
    .where(inArray(transactions.id, parsed.data.transactionIds))
    .all();

  const allCategories = db.select().from(categories).all() as Category[];
  const assignableForAi = filterAssignableCategories(allCategories);

  const results = await categoriseWithAI(
    txns.map((t) => ({
      id: t.id,
      normalised: t.normalised,
      amount: t.amount,
      date: t.date,
    })),
    assignableForAi,
    apiKey,
    model,
  );

  // Update transactions
  for (const result of results) {
    if (result.categoryId && isAssignableCategoryId(result.categoryId)) {
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

  return NextResponse.json({ categorised: results.length });
}
