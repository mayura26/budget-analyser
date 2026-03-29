import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import {
  DEFAULT_HOME_CURRENCY,
  isSupportedCurrency,
  type SupportedCurrency,
} from "./supported";

export function getHomeCurrency(): SupportedCurrency {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "home_currency"))
    .get();
  const v = row?.value?.trim() ?? "";
  if (isSupportedCurrency(v)) return v;
  return DEFAULT_HOME_CURRENCY;
}
