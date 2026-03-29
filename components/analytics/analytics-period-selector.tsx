"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ANALYTICS_PRESETS,
  type AnalyticsPreset,
} from "@/lib/analytics/date-range";

const PRESET_LABELS: Record<AnalyticsPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_12_months: "Last 12 months",
  ytd: "Year to date",
  this_year: "This calendar year",
  custom: "Custom range",
};

export function AnalyticsPeriodSelector({
  preset,
  rangeStart,
  rangeEnd,
}: {
  preset: AnalyticsPreset;
  rangeStart: string;
  rangeEnd: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(rangeStart);
  const [to, setTo] = useState(rangeEnd);

  useEffect(() => {
    setFrom(rangeStart);
    setTo(rangeEnd);
  }, [rangeStart, rangeEnd]);

  const applyCustom = () => {
    const params = new URLSearchParams();
    params.set("preset", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`/analytics?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="space-y-1.5 min-w-[200px]">
        <Label
          htmlFor="analytics-preset"
          className="text-xs text-muted-foreground"
        >
          Period
        </Label>
        <Select
          value={preset}
          onValueChange={(v) => {
            const p = v as AnalyticsPreset;
            if (p === "custom") {
              const params = new URLSearchParams();
              params.set("preset", "custom");
              params.set("from", rangeStart);
              params.set("to", rangeEnd);
              router.push(`/analytics?${params.toString()}`);
            } else {
              router.push(`/analytics?preset=${p}`);
            }
          }}
        >
          <SelectTrigger
            id="analytics-preset"
            className="h-9 w-full sm:w-[220px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ANALYTICS_PRESETS.map((key) => (
              <SelectItem key={key} value={key}>
                {PRESET_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="analytics-from"
              className="text-xs text-muted-foreground"
            >
              From
            </Label>
            <Input
              id="analytics-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="analytics-to"
              className="text-xs text-muted-foreground"
            >
              To
            </Label>
            <Input
              id="analytics-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
          <Button type="button" size="sm" className="h-9" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
