import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(amount));
}

export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthRange(monthStr: string): {
  start: string;
  end: string;
} {
  const [year, month] = monthStr.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Calendar month arithmetic (YYYY-MM). */
export function addCalendarMonths(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function enumerateMonthsInclusive(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addCalendarMonths(cur, 1);
  }
  return out;
}

/** Last `count` calendar months ending at `endMonth` (inclusive). */
export function getMonthsEndingAt(endMonth: string, count: number): string[] {
  const start = addCalendarMonths(endMonth, -(count - 1));
  return enumerateMonthsInclusive(start, endMonth);
}

/**
 * Normalise `?month=` (YYYY-MM). Invalid or out-of-range values fall back to
 * `maxMonth` (typically the current month).
 */
export function parseMonthParam(
  param: string | undefined,
  minMonth: string,
  maxMonth: string,
): string {
  if (!param || !/^\d{4}-\d{2}$/.test(param)) {
    return maxMonth;
  }
  const monthNum = Number(param.slice(5, 7));
  if (monthNum < 1 || monthNum > 12) {
    return maxMonth;
  }
  const year = param.slice(0, 4);
  const candidate = `${year}-${String(monthNum).padStart(2, "0")}`;
  if (candidate < minMonth) return minMonth;
  if (candidate > maxMonth) return maxMonth;
  return candidate;
}
