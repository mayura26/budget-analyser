"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Account, Occurrence } from "@/types";

interface Props {
  occurrences: Occurrence[];
  accounts: Account[];
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

type CalendarCell = { key: string; dateStr: string | null };

function buildCalendarDays(year: number, month: number): CalendarCell[] {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1);
  // Monday = 0, Sunday = 6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push({ key: `pad-${year}-${month}-${i}`, dateStr: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ key: dateStr, dateStr });
  }
  return cells;
}

export function BudgetCalendar({ occurrences, accounts }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const today = isoToday();
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const occByDate = new Map<string, Occurrence[]>();
  for (const occ of occurrences) {
    if (!occByDate.has(occ.date)) occByDate.set(occ.date, []);
    occByDate.get(occ.date)?.push(occ);
  }

  const cells = buildCalendarDays(year, month);

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

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold text-lg">{monthLabel}</h3>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground border-b pb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {cells.map(({ key: cellKey, dateStr }) => {
          if (!dateStr) {
            return <div key={cellKey} className="bg-background min-h-20" />;
          }

          const events = occByDate.get(dateStr) ?? [];
          const isPast = dateStr < today;
          const isToday = dateStr === today;

          const cell = (
            <div
              key={dateStr}
              className={`bg-background min-h-20 p-1 ${isPast ? "opacity-50" : ""}`}
            >
              <div className="flex justify-end">
                <span
                  className={`text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {parseInt(dateStr.slice(8), 10)}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5 overflow-hidden">
                {events.slice(0, 3).map((ev) => (
                  <div
                    key={`${ev.scheduleId}-${ev.name}-${ev.amount}-${dateStr}`}
                    className={`truncate text-xs rounded px-1 py-0.5 ${
                      ev.amount > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {ev.name}
                  </div>
                ))}
                {events.length > 3 && (
                  <div className="text-xs text-muted-foreground pl-1">
                    +{events.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );

          if (events.length === 0) return cell;

          return (
            <Popover key={dateStr}>
              <PopoverTrigger asChild>
                <div className="cursor-pointer hover:bg-accent/50 transition-colors">
                  {cell}
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-56 sm:w-64 p-3 space-y-2">
                <p className="text-sm font-semibold">
                  {new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                {events.map((ev) => (
                  <div
                    key={`${ev.scheduleId}-${ev.name}-${ev.amount}-${dateStr}`}
                    className="text-sm space-y-0.5"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{ev.name}</span>
                      <span
                        className={
                          ev.amount > 0 ? "text-green-600" : "text-red-600"
                        }
                      >
                        {ev.amount > 0 ? "+" : "-"}$
                        {Math.abs(ev.amount).toLocaleString("en-AU", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    {ev.accountId && (
                      <p className="text-xs text-muted-foreground">
                        {accountMap.get(ev.accountId) ?? "Unknown account"}
                      </p>
                    )}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}
