import OpenAI from "openai";
import type { Category } from "@/types";

export type AICategorisationResult = {
  transactionId: number;
  categoryId: number | null;
  categoryName: string;
  confidence: number;
};

type TransactionInput = {
  id: number;
  normalised: string;
  amount: number;
  date: string;
  accountName?: string;
};

/** OpenAI o-series and codex-mini use reasoning params; they reject `temperature` / `top_p`. */
function isOpenAIReasoningChatModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/^o\d/.test(m)) return true;
  return m === "codex-mini-latest";
}

export async function categoriseWithAI(
  transactions: TransactionInput[],
  categories: Category[],
  apiKey: string,
  model = "gpt-4o-mini"
): Promise<AICategorisationResult[]> {
  const client = new OpenAI({ apiKey });

  const categoryList = categories
    .filter((c) => c.parentId != null && c.type !== "transfer")
    .map((c) => `${c.id}: ${c.name} (${c.type})`)
    .join("\n");

  const transactionList = transactions
    .map(
      (t) =>
        `ID ${t.id}: "${t.normalised}" | AUD ${t.amount.toFixed(2)} | ${t.date}${t.accountName ? ` | ${t.accountName}` : ""}`
    )
    .join("\n");

  const prompt = `You are a financial transaction categoriser. Categorise each transaction into one of the available categories.

Available categories:
${categoryList}

Transactions to categorise:
${transactionList}

Respond with a JSON object with a single key "results" whose value is an array. Each array item must have:
- id: transaction ID (number)
- categoryId: matching category ID (number) or null if uncertain
- categoryName: category name (string)
- confidence: 0.0 to 1.0 (number)

Example shape: {"results":[{"id":1,"categoryId":2,"categoryName":"Groceries","confidence":0.9}]}

Only return the JSON object, no other text.`;

  const reasoning = isOpenAIReasoningChatModel(model);

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    ...(reasoning
      ? { reasoning_effort: "medium" as const }
      : { temperature: 0.1 }),
  });

  const content = response.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content);
    const results: AICategorisationResult[] = Array.isArray(parsed)
      ? parsed
      : parsed.results ?? parsed.transactions ?? [];

    return results.map((r: Record<string, unknown>) => ({
      transactionId: r.id as number,
      categoryId: r.categoryId as number | null,
      categoryName: (r.categoryName as string) ?? "Unknown",
      confidence: (r.confidence as number) ?? 0.7,
    }));
  } catch {
    return [];
  }
}
