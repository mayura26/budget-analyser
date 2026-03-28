import type { Occurrence, ScheduledTransaction } from "@/types";

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

function nextOccurrence(
  from: string,
  frequency: ScheduledTransaction["frequency"],
): string {
  switch (frequency) {
    case "weekly":
      return addDays(from, 7);
    case "fortnightly":
      return addDays(from, 14);
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "yearly":
      return addMonths(from, 12);
  }
}

// Advance startDate forward by frequency steps until >= target
function firstOnOrAfter(
  startDate: string,
  target: string,
  frequency: ScheduledTransaction["frequency"],
): string {
  let current = startDate;
  // For day-based: compute step count
  if (frequency === "weekly" || frequency === "fortnightly") {
    const step = frequency === "weekly" ? 7 : 14;
    const diffMs =
      new Date(`${target}T00:00:00`).getTime() -
      new Date(`${startDate}T00:00:00`).getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays <= 0) return startDate;
    const steps = Math.ceil(diffDays / step);
    current = addDays(startDate, steps * step);
    // Back up one step in case we overshot
    const prev = addDays(current, -step);
    if (prev >= target) current = prev;
  } else {
    while (current < target) {
      current = nextOccurrence(current, frequency);
    }
  }
  return current;
}

export function generateOccurrences(
  schedules: (ScheduledTransaction & { categoryColor: string | null })[],
  rangeStart: string,
  rangeEnd: string,
): Occurrence[] {
  const results: Occurrence[] = [];

  for (const schedule of schedules) {
    if (!schedule.isActive) continue;

    const effectiveStart =
      schedule.startDate > rangeStart ? schedule.startDate : rangeStart;
    const effectiveEnd = schedule.endDate
      ? schedule.endDate < rangeEnd
        ? schedule.endDate
        : rangeEnd
      : rangeEnd;

    if (effectiveStart > effectiveEnd) continue;

    let current = firstOnOrAfter(
      schedule.startDate,
      effectiveStart,
      schedule.frequency,
    );

    while (current <= effectiveEnd) {
      results.push({
        date: current,
        scheduleId: schedule.id,
        name: schedule.name,
        amount: schedule.amount,
        accountId: schedule.accountId,
        categoryId: schedule.categoryId,
        categoryColor: schedule.categoryColor,
      });
      current = nextOccurrence(current, schedule.frequency);
    }
  }

  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

export function buildBalancePoints(
  occurrences: Occurrence[],
  startingBalance: number,
  rangeStart: string,
  rangeEnd: string,
): import("@/types").BalancePoint[] {
  // Group by date
  const byDate = new Map<string, { income: number; expense: number }>();

  for (const occ of occurrences) {
    if (!byDate.has(occ.date)) byDate.set(occ.date, { income: 0, expense: 0 });
    const entry = byDate.get(occ.date);
    if (!entry) continue;
    if (occ.amount > 0) entry.income += occ.amount;
    else entry.expense += Math.abs(occ.amount);
  }

  const points: import("@/types").BalancePoint[] = [];
  let balance = startingBalance;
  let current = rangeStart;

  while (current <= rangeEnd) {
    const day = byDate.get(current);
    if (day) {
      balance += day.income - day.expense;
      const d = new Date(`${current}T00:00:00`);
      const label = d.toLocaleDateString("en-AU", {
        month: "short",
        day: "numeric",
      });
      points.push({
        date: label,
        isoDate: current,
        balance: Math.round(balance * 100) / 100,
        dayIncome: Math.round(day.income * 100) / 100,
        dayExpense: Math.round(day.expense * 100) / 100,
      });
    } else if (
      points.length === 0 ||
      current === rangeStart ||
      current === rangeEnd
    ) {
      const d = new Date(`${current}T00:00:00`);
      const label = d.toLocaleDateString("en-AU", {
        month: "short",
        day: "numeric",
      });
      points.push({
        date: label,
        isoDate: current,
        balance: Math.round(balance * 100) / 100,
        dayIncome: 0,
        dayExpense: 0,
      });
    }
    current = addDays(current, 1);
  }

  return points;
}
