"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency, getCurrentMonth } from "@/lib/utils";
import type { Account, Occurrence } from "@/types";

interface Props {
  occurrences: Occurrence[];
  accounts: Account[];
  homeCurrency: SupportedCurrency;
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const INCOME_FALLBACK = "#22c55e";
const EXPENSE_FALLBACK = "#ef4444";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

type CalendarCell = { dateStr: string; inMonth: boolean };

function buildCalendarGrid(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(year, month, 1);
  // Monday = 0, Sunday = 6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  if (startOffset > 0) {
    const prevMonthDays = new Date(year, month, 0).getDate();
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ dateStr, inMonth: false });
    }
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ dateStr, inMonth: true });
  }

  // Pad to 6 rows × 7 cols = 42 cells for consistent grid height across months.
  const remaining = 42 - cells.length;
  if (remaining > 0) {
    const nextYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    for (let d = 1; d <= remaining; d++) {
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ dateStr, inMonth: false });
    }
  }
  return cells;
}

function summarizeMonth(
  occurrences: Occurrence[],
  year: number,
  month: number,
) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  let income = 0;
  let expense = 0;
  for (const o of occurrences) {
    if (!o.date.startsWith(prefix)) continue;
    if (o.amount > 0) income += o.amount;
    else expense += -o.amount;
  }
  return { income, expense, net: income - expense };
}

function dayNet(events: Occurrence[]): number {
  let n = 0;
  for (const e of events) n += e.amount;
  return n;
}

function eventColor(ev: Occurrence): string {
  if (ev.categoryColor) return ev.categoryColor;
  return ev.amount > 0 ? INCOME_FALLBACK : EXPENSE_FALLBACK;
}

function MonthSummaryChip({
  income,
  expense,
  homeCurrency,
}: {
  income: number;
  expense: number;
  homeCurrency: SupportedCurrency;
}) {
  if (income === 0 && expense === 0) return null;
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs font-mono tabular-nums">
      <span className="text-green-600 dark:text-green-400">
        +{formatCurrency(income, homeCurrency)}
      </span>
      <span className="text-muted-foreground/50">·</span>
      <span className="text-red-600 dark:text-red-400">
        −{formatCurrency(expense, homeCurrency)}
      </span>
    </div>
  );
}

function EventRow({
  ev,
  accountName,
  homeCurrency,
}: {
  ev: Occurrence;
  accountName: string | null;
  homeCurrency: SupportedCurrency;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="h-2 w-2 rounded-full shrink-0 mt-1.5"
          style={{ backgroundColor: eventColor(ev) }}
        />
        <div className="min-w-0">
          <p className="font-medium truncate leading-tight">{ev.name}</p>
          {accountName && (
            <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
              {accountName}
            </p>
          )}
        </div>
      </div>
      <span
        className={cn(
          "font-mono tabular-nums text-sm shrink-0",
          ev.amount > 0
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400",
        )}
      >
        {ev.amount > 0 ? "+" : "−"}
        {formatCurrency(Math.abs(ev.amount), homeCurrency)}
      </span>
    </div>
  );
}

export function BudgetCalendar({ occurrences, accounts, homeCurrency }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const today = isoToday();
  const currentMonth = getCurrentMonth();
  const viewMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
  const isCurrentMonthView = viewMonth === currentMonth;

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const occByDate = new Map<string, Occurrence[]>();
  for (const occ of occurrences) {
    if (!occByDate.has(occ.date)) occByDate.set(occ.date, []);
    occByDate.get(occ.date)?.push(occ);
  }

  const cells = buildCalendarGrid(year, month);
  const summary = summarizeMonth(occurrences, year, month);

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  }

  function goToday() {
    const n = new Date();
    setYear(n.getFullYear());
    setMonth(n.getMonth());
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={prevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3
            className="font-semibold text-base sm:text-lg tracking-tight truncate"
            data-testid="calendar-month-label"
          >
            {monthLabel}
          </h3>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={nextMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonthView && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs hidden sm:inline-flex"
              onClick={goToday}
            >
              Today
            </Button>
          )}
        </div>
        <MonthSummaryChip
          income={summary.income}
          expense={summary.expense}
          homeCurrency={homeCurrency}
        />
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border/70 overflow-hidden shadow-sm">
        {cells.map(({ dateStr, inMonth }) => {
          const events = inMonth ? (occByDate.get(dateStr) ?? []) : [];
          const isPast = dateStr < today;
          const isToday = dateStr === today;
          const dow = new Date(`${dateStr}T00:00:00`).getDay();
          const isWeekend = dow === 0 || dow === 6;
          const dayNumber = parseInt(dateStr.slice(8), 10);
          const net = dayNet(events);
          const hasEvents = events.length > 0;

          const cellInner = (
            <div
              className={cn(
                "relative flex flex-col h-full min-h-16 sm:min-h-24 lg:min-h-28 p-1 sm:p-1.5 transition-colors",
                "bg-card",
                isWeekend && inMonth && "bg-muted/40",
                !inMonth && "opacity-40",
                inMonth && isPast && !isToday && "opacity-70",
                isToday && "ring-1 ring-inset ring-primary/50 z-10",
                hasEvents && "hover:bg-accent/50",
              )}
            >
              {/* Date number */}
              <div className="flex items-start">
                <span
                  className={cn(
                    "inline-flex items-center justify-center text-[11px] sm:text-xs font-semibold tabular-nums leading-none",
                    isToday
                      ? "h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-primary text-primary-foreground"
                      : "h-5 w-5 sm:h-6 sm:w-6 text-foreground/85",
                  )}
                >
                  {dayNumber}
                </span>
              </div>

              {/* Event chips — desktop */}
              {hasEvents && (
                <div className="hidden sm:flex flex-col gap-0.5 mt-1 overflow-hidden">
                  {events.slice(0, 3).map((ev, i) => (
                    <div
                      key={`chip-${ev.scheduleId}-${ev.name}-${ev.amount}-${i}`}
                      className="flex items-center truncate rounded-sm bg-foreground/[0.04] dark:bg-foreground/[0.07] pl-1.5 pr-1 py-0.5 border-l-2 text-[11px] leading-tight"
                      style={{ borderLeftColor: eventColor(ev) }}
                    >
                      <span className="truncate text-foreground/90">
                        {ev.name}
                      </span>
                    </div>
                  ))}
                  {events.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1 pt-0.5 leading-none">
                      +{events.length - 3} more
                    </div>
                  )}
                </div>
              )}

              {/* Event dots — mobile */}
              {hasEvents && (
                <div className="flex sm:hidden items-center flex-wrap gap-0.5 mt-1">
                  {events.slice(0, 4).map((ev, i) => (
                    <span
                      key={`dot-${ev.scheduleId}-${ev.name}-${ev.amount}-${i}`}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: eventColor(ev) }}
                    />
                  ))}
                  {events.length > 4 && (
                    <span className="text-[8px] text-muted-foreground leading-none ml-0.5">
                      +{events.length - 4}
                    </span>
                  )}
                </div>
              )}

              {/* Day net total */}
              {hasEvents && (
                <div
                  className={cn(
                    "mt-auto pt-1 text-right font-mono text-[9px] sm:text-[10px] tabular-nums leading-none",
                    net > 0 && "text-green-600 dark:text-green-400",
                    net < 0 && "text-red-600 dark:text-red-400",
                    net === 0 && "text-muted-foreground",
                  )}
                >
                  {net > 0 ? "+" : net < 0 ? "−" : ""}
                  {formatCurrency(Math.abs(net), homeCurrency)}
                </div>
              )}
            </div>
          );

          if (!inMonth || !hasEvents) {
            return (
              <div key={`${dateStr}-${inMonth ? "in" : "out"}`}>
                {cellInner}
              </div>
            );
          }

          const incomes = events.filter((e) => e.amount > 0);
          const expenses = events.filter((e) => e.amount < 0);

          return (
            <Popover key={dateStr}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset cursor-pointer"
                >
                  {cellInner}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 sm:w-72 p-0 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                  <p className="text-sm font-semibold tracking-tight">
                    {new Date(`${dateStr}T00:00:00`).toLocaleDateString(
                      "en-AU",
                      {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      },
                    )}
                  </p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums",
                      net > 0 &&
                        "bg-green-500/10 text-green-600 dark:text-green-400",
                      net < 0 && "bg-red-500/10 text-red-600 dark:text-red-400",
                      net === 0 && "bg-muted text-muted-foreground",
                    )}
                  >
                    {net > 0 ? "+" : net < 0 ? "−" : ""}
                    {formatCurrency(Math.abs(net), homeCurrency)}
                  </span>
                </div>
                <div className="px-3 py-2.5 space-y-2 max-h-72 overflow-y-auto">
                  {incomes.length > 0 && (
                    <div className="space-y-1.5">
                      {incomes.map((ev, i) => (
                        <EventRow
                          key={`inc-${ev.scheduleId}-${ev.name}-${i}`}
                          ev={ev}
                          accountName={
                            ev.accountId
                              ? (accountMap.get(ev.accountId) ??
                                "Unknown account")
                              : null
                          }
                          homeCurrency={homeCurrency}
                        />
                      ))}
                    </div>
                  )}
                  {incomes.length > 0 && expenses.length > 0 && (
                    <div className="border-t border-border/60" />
                  )}
                  {expenses.length > 0 && (
                    <div className="space-y-1.5">
                      {expenses.map((ev, i) => (
                        <EventRow
                          key={`exp-${ev.scheduleId}-${ev.name}-${i}`}
                          ev={ev}
                          accountName={
                            ev.accountId
                              ? (accountMap.get(ev.accountId) ??
                                "Unknown account")
                              : null
                          }
                          homeCurrency={homeCurrency}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
