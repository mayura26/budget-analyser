import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KPITone =
  | "income"
  | "expense"
  | "net-positive"
  | "net-negative"
  | "neutral";

const TONE_STYLES: Record<
  KPITone,
  { wrap: string; icon: string; value: string }
> = {
  income: {
    wrap: "bg-kpi-income-bg",
    icon: "text-green-600 dark:text-green-400",
    value: "text-green-600 dark:text-green-400",
  },
  expense: {
    wrap: "bg-kpi-expense-bg",
    icon: "text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
  },
  "net-positive": {
    wrap: "bg-kpi-net-bg",
    icon: "text-primary dark:text-blue-400",
    value: "text-primary dark:text-blue-400",
  },
  "net-negative": {
    wrap: "bg-kpi-net-bg",
    icon: "text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
  },
  neutral: {
    wrap: "bg-kpi-tx-bg",
    icon: "text-purple-600 dark:text-purple-400",
    value: "",
  },
};

interface KPICardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: KPITone;
  subtitle?: ReactNode;
  /** Compact variant tightens padding for dense grids (e.g. dashboard 4-up). */
  compact?: boolean;
  className?: string;
}

export function KPICard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  subtitle,
  compact = false,
  className,
}: KPICardProps) {
  const styles = TONE_STYLES[tone];

  return (
    <Card className={className}>
      <CardHeader
        className={cn(
          "flex flex-row items-center justify-between space-y-0",
          compact ? "p-3 pb-1.5 sm:p-6 sm:pb-2" : "pb-2",
        )}
      >
        <CardTitle
          className={cn(
            "font-medium text-muted-foreground",
            compact ? "text-xs sm:text-sm" : "text-sm",
          )}
        >
          {label}
        </CardTitle>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full",
            compact ? "h-7 w-7 sm:h-9 sm:w-9" : "h-9 w-9",
            styles.wrap,
          )}
        >
          <Icon
            className={cn(
              compact ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4",
              styles.icon,
            )}
          />
        </div>
      </CardHeader>
      <CardContent className={cn(compact && "p-3 pt-0 sm:p-6 sm:pt-0")}>
        <p
          className={cn(
            "font-bold",
            compact ? "text-xl sm:text-2xl" : "text-2xl",
            styles.value,
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
