import {
  addCalendarMonths,
  enumerateMonthsInclusive,
  getMonthRange,
} from "@/lib/utils";

export const ANALYTICS_PRESETS = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_12_months",
  "ytd",
  "this_year",
  "custom",
] as const;

export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];

export type AnalyticsDateRange = {
  start: string;
  end: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar YYYY-MM-DD from a Date (no UTC shift). */
export function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonthFromParts(year: number, month1: number): string {
  return `${year}-${pad2(month1)}-01`;
}

/** Inclusive calendar months between two YYYY-MM-DD dates (same month allowed). */
export function monthsInDateRangeInclusive(
  start: string,
  end: string,
): string[] {
  const ymStart = start.slice(0, 7);
  const ymEnd = end.slice(0, 7);
  return enumerateMonthsInclusive(ymStart, ymEnd);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

export function getDateRangeForPreset(
  preset: AnalyticsPreset,
  now: Date = new Date(),
): AnalyticsDateRange {
  const today = toLocalISODate(now);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  switch (preset) {
    case "this_month": {
      const start = startOfMonthFromParts(y, m);
      const end = today < start ? start : today;
      return { start, end };
    }
    case "last_month": {
      const prev = addCalendarMonths(`${y}-${pad2(m)}`, -1);
      const { start, end } = getMonthRange(prev);
      return { start, end };
    }
    case "last_3_months": {
      const endMonth = `${y}-${pad2(m)}`;
      const startMonth = addCalendarMonths(endMonth, -2);
      return {
        start: getMonthRange(startMonth).start,
        end: today,
      };
    }
    case "last_12_months": {
      const endMonth = `${y}-${pad2(m)}`;
      const startMonth = addCalendarMonths(endMonth, -11);
      return {
        start: getMonthRange(startMonth).start,
        end: today,
      };
    }
    case "ytd": {
      const start = `${y}-01-01`;
      const end = today < start ? start : today;
      return { start, end };
    }
    case "this_year": {
      return {
        start: `${y}-01-01`,
        end: `${y}-12-31`,
      };
    }
    default: {
      const { start, end } = getDateRangeForPreset("this_month", now);
      return { start, end };
    }
  }
}

export type ParsedAnalyticsParams = {
  preset: AnalyticsPreset;
  range: AnalyticsDateRange;
};

function parsePresetParam(raw: string | undefined): AnalyticsPreset {
  if (raw && (ANALYTICS_PRESETS as readonly string[]).includes(raw)) {
    return raw as AnalyticsPreset;
  }
  return "this_month";
}

/**
 * Resolve analytics URL search params into a concrete inclusive date range.
 * - Stale `from`/`to` are ignored when `preset` is set to a non-custom value.
 * - `from`/`to` alone (no `preset`) imply a custom range.
 * - `preset=custom` without valid dates falls back to this month.
 */
export function parseAnalyticsSearchParams(params: {
  preset?: string;
  from?: string;
  to?: string;
}): ParsedAnalyticsParams {
  const presetRaw = parsePresetParam(params.preset);
  const fromOk = params.from && isValidISODate(params.from);
  const toOk = params.to && isValidISODate(params.to);
  const fromStr = fromOk ? params.from : undefined;
  const toStr = toOk ? params.to : undefined;
  const customRangeValid = Boolean(fromStr && toStr && fromStr <= toStr);

  if (presetRaw === "custom") {
    if (customRangeValid && fromStr && toStr) {
      return {
        preset: "custom",
        range: { start: fromStr, end: toStr },
      };
    }
    return {
      preset: "custom",
      range: getDateRangeForPreset("this_month"),
    };
  }

  if (customRangeValid && params.preset === undefined && fromStr && toStr) {
    return {
      preset: "custom",
      range: { start: fromStr, end: toStr },
    };
  }

  return {
    preset: presetRaw,
    range: getDateRangeForPreset(presetRaw),
  };
}

export function formatAnalyticsRangeLabel(start: string, end: string): string {
  const a = new Date(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  );
  const b = new Date(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  );
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return a.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }
  const opt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  return `${a.toLocaleDateString("en-AU", opt)} – ${b.toLocaleDateString("en-AU", opt)}`;
}
