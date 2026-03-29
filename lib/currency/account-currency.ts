import {
  DEFAULT_HOME_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from "./supported";

/** Coerce stored account currency to a supported code; invalid legacy values fall back. */
export function parseAccountCurrency(
  raw: string | null | undefined,
  fallback: SupportedCurrency = DEFAULT_HOME_CURRENCY,
): SupportedCurrency {
  const u = (raw ?? "").trim().toUpperCase();
  if (isSupportedCurrency(u)) return u;
  return fallback;
}
