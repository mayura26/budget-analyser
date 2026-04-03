import { eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import { convertToHome, prefetchRatesToHome } from "@/lib/currency/convert";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import {
  accounts,
  categories,
  scheduledTransactions,
  settings,
  transactions,
} from "@/lib/db/schema";
import {
  isOpenAIReasoningChatModel,
  openAIModelOnlySupportsDefaultTemperature,
} from "@/lib/openai/model-params";

export async function POST() {
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

  const homeCurrency = getHomeCurrency();

  // Fetch last 6 months of non-transfer transactions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10);

  const allCategories = db.select().from(categories).all();
  const transferCategoryIds = new Set(
    allCategories.filter((c) => c.type === "transfer").map((c) => c.id),
  );
  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

  const rawRows = db
    .select({
      normalised: transactions.normalised,
      amount: transactions.amount,
      date: transactions.date,
      categoryId: transactions.categoryId,
      accountCurrency: accounts.currency,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(gte(transactions.date, cutoff))
    .all()
    .filter((t) => !t.categoryId || !transferCategoryIds.has(t.categoryId));

  await prefetchRatesToHome(
    db,
    rawRows.map((r) => ({
      date: r.date,
      from: parseAccountCurrency(r.accountCurrency, homeCurrency),
    })),
    homeCurrency,
  );

  // Group by normalised description (amounts in home currency)
  const groups = new Map<
    string,
    {
      description: string;
      categoryId: number | null;
      amounts: number[];
      dates: string[];
    }
  >();

  for (const txn of rawRows) {
    const ccy = parseAccountCurrency(txn.accountCurrency, homeCurrency);
    const amountHome = convertToHome(db, txn.amount, ccy, homeCurrency, txn.date);

    const key = txn.normalised;
    let g = groups.get(key);
    if (!g) {
      g = {
        description: txn.normalised,
        categoryId: txn.categoryId ?? null,
        amounts: [],
        dates: [],
      };
      groups.set(key, g);
    }
    g.amounts.push(amountHome);
    g.dates.push(txn.date);
    // Use most recent category
    if (txn.categoryId) g.categoryId = txn.categoryId;
  }

  // Filter to groups with 2+ occurrences, cap at 80
  const recurring = [...groups.values()]
    .filter((g) => g.dates.length >= 2)
    .slice(0, 80)
    .map((g) => {
      const sortedDates = [...g.dates].sort();
      const avgAmount = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length;
      const days = sortedDates.map((d) => parseInt(d.slice(8, 10), 10));
      const avgDay = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
      const category = g.categoryId ? categoryMap.get(g.categoryId) : null;
      return {
        description: g.description,
        categoryId: g.categoryId,
        categoryName: category?.name ?? null,
        occurrences: g.dates.length,
        avgAmount: Math.round(avgAmount * 100) / 100,
        dates: sortedDates,
        avgDayOfMonth: avgDay,
      };
    });

  if (recurring.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // Fetch existing scheduled transaction names to avoid duplicates
  const existingSchedules = db.select().from(scheduledTransactions).all();
  const existingNames = existingSchedules.map((s) => s.name.toLowerCase());

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are a financial analyst. Analyse these grouped transaction patterns from the last 6 months and identify which ones are clearly recurring bills, subscriptions, or regular income.

Today's date: ${today}

All amounts below are in the user's home currency (${homeCurrency}), converted from account currencies where needed.

Transaction groups (description | category | occurrences | avg_amount | dates | avg_day_of_month):
${recurring
  .map(
    (g) =>
      `- "${g.description}" | ${g.categoryName ?? "Not processed"} | ${g.occurrences}x | ${homeCurrency} ${g.avgAmount.toFixed(2)} | [${g.dates.join(", ")}] | avg day ${g.avgDayOfMonth}`,
  )
  .join("\n")}

Already scheduled (skip these): ${existingNames.length > 0 ? existingNames.join(", ") : "none"}

Rules:
- Only return patterns you are highly confident (≥0.7) are recurring
- Use negative amounts for expenses, positive for income (amounts must be in ${homeCurrency})
- frequency: "weekly" (~7 days apart), "fortnightly" (~14 days), "monthly" (~30 days), "quarterly" (~90 days), "yearly" (~365 days)
- startDate: the next expected occurrence from today in YYYY-MM-DD format
- name: a clean, human-readable merchant name (not the raw bank description)
- Skip anything that looks like a one-off, transfer, or random purchase
- Skip anything already in the "Already scheduled" list

Respond with a JSON object: {"suggestions": [...]}
Each suggestion: {"name": string, "amount": number, "frequency": string, "startDate": string, "categoryId": number|null, "reasoning": string, "confidence": number}
Only return the JSON object, no other text.`;

  const client = new OpenAI({ apiKey });
  const reasoning = isOpenAIReasoningChatModel(model);
  const defaultTempOnly = openAIModelOnlySupportsDefaultTemperature(model);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    ...(reasoning
      ? { reasoning_effort: "medium" as const }
      : defaultTempOnly
        ? {}
        : { temperature: 0.1 }),
  });

  const content = response.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content);
    const suggestions = Array.isArray(parsed)
      ? parsed
      : (parsed.suggestions ?? []);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
