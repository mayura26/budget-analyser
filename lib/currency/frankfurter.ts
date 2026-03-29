import type { SupportedCurrency } from "./supported";

const BASE = "https://api.frankfurter.app";

export type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Partial<Record<string, number>>;
};

/**
 * Fetch units of `to` per one unit of `from` on `date` (YYYY-MM-DD).
 */
export async function fetchFrankfurterRate(
  date: string,
  from: SupportedCurrency,
  to: SupportedCurrency,
): Promise<number> {
  if (from === to) return 1;

  const url = `${BASE}/${date}?from=${from}&to=${to}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) {
    throw new Error(`Frankfurter HTTP ${res.status} for ${url}`);
  }
  const data = (await res.json()) as FrankfurterResponse;
  const rate = data.rates[to];
  if (
    rate === undefined ||
    typeof rate !== "number" ||
    !Number.isFinite(rate)
  ) {
    throw new Error(
      `Frankfurter missing rate ${from}->${to} on ${date}: ${JSON.stringify(data)}`,
    );
  }
  return rate;
}
