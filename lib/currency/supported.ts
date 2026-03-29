/** ISO 4217 codes supported for home and account currency. */
export const SUPPORTED_CURRENCIES = [
  "AUD",
  "USD",
  "NZD",
  "GBP",
  "CAD",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

export const DEFAULT_HOME_CURRENCY: SupportedCurrency = "AUD";

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  AUD: "Australian dollar (AUD)",
  USD: "US dollar (USD)",
  NZD: "New Zealand dollar (NZD)",
  GBP: "British pound (GBP)",
  CAD: "Canadian dollar (CAD)",
};
