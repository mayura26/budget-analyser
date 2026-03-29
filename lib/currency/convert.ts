import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { fxRates } from "@/lib/db/schema";
import { fetchFrankfurterRate } from "./frankfurter";
import type { SupportedCurrency } from "./supported";

export type RateKey = { date: string; from: SupportedCurrency };

function readCachedRate(
  database: DB,
  date: string,
  from: SupportedCurrency,
  to: SupportedCurrency,
): number | undefined {
  if (from === to) return 1;
  const row = database
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(
      and(
        eq(fxRates.rateDate, date),
        eq(fxRates.baseCurrency, from),
        eq(fxRates.quoteCurrency, to),
      ),
    )
    .get();
  const r = row?.rate;
  if (r === undefined || r === null || !Number.isFinite(r)) return undefined;
  return r;
}

function writeCachedRate(
  database: DB,
  date: string,
  from: SupportedCurrency,
  to: SupportedCurrency,
  rate: number,
): void {
  if (from === to) return;
  database
    .insert(fxRates)
    .values({
      rateDate: date,
      baseCurrency: from,
      quoteCurrency: to,
      rate,
      fetchedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: [fxRates.rateDate, fxRates.baseCurrency, fxRates.quoteCurrency],
      set: {
        rate,
        fetchedAt: Math.floor(Date.now() / 1000),
      },
    })
    .run();
}

/**
 * Ensure rates are cached for each (date, from) pair into `homeCurrency`.
 */
export async function prefetchRatesToHome(
  database: DB,
  keys: RateKey[],
  homeCurrency: SupportedCurrency,
): Promise<void> {
  const uniq = new Map<string, RateKey>();
  for (const k of keys) {
    if (k.from === homeCurrency) continue;
    uniq.set(`${k.date}\0${k.from}`, k);
  }
  for (const k of uniq.values()) {
    let rate = readCachedRate(database, k.date, k.from, homeCurrency);
    if (rate === undefined) {
      rate = await fetchFrankfurterRate(k.date, k.from, homeCurrency);
      writeCachedRate(database, k.date, k.from, homeCurrency, rate);
    }
  }
}

/**
 * Convert amount in account currency to home currency using cached rates (call prefetch first).
 */
export function convertToHome(
  database: DB,
  amount: number,
  accountCurrency: SupportedCurrency,
  homeCurrency: SupportedCurrency,
  date: string,
): number {
  if (accountCurrency === homeCurrency) return amount;
  const rate = readCachedRate(database, date, accountCurrency, homeCurrency);
  if (rate === undefined) {
    throw new Error(
      `Missing FX rate ${accountCurrency}->${homeCurrency} on ${date}; call prefetchRatesToHome first`,
    );
  }
  return Math.round(amount * rate * 100) / 100;
}
