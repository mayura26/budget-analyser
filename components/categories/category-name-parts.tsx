"use client";

import { parseCategoryDisplayName } from "@/lib/categories/display-name";
import { cn } from "@/lib/utils";

export function CategoryNameParts({
  name,
  variant = "list",
  className,
  listTitleWeight = "medium",
}: {
  name: string;
  variant?: "list" | "select" | "badge";
  className?: string;
  /** Only applies when variant is "list". */
  listTitleWeight?: "medium" | "semibold";
}) {
  const { title, subtext } = parseCategoryDisplayName(name);
  const listTitleClass =
    listTitleWeight === "semibold" ? "font-semibold" : "font-medium";

  if (variant === "badge") {
    return (
      <span
        className={cn(
          "inline-flex min-w-0 max-w-full flex-col gap-0 text-left leading-tight",
          className,
        )}
      >
        <span className="truncate font-medium">{title}</span>
        {subtext ? (
          <span className="truncate text-[10px] font-normal opacity-85">
            {subtext}
          </span>
        ) : null}
      </span>
    );
  }

  if (variant === "select") {
    return (
      <span className={cn("flex min-w-0 flex-col gap-0 text-left", className)}>
        <span className="truncate text-sm leading-tight">{title}</span>
        {subtext ? (
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            {subtext}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className={cn("truncate leading-tight", listTitleClass)}>
        {title}
      </span>
      {subtext ? (
        <span className="truncate text-xs text-muted-foreground leading-snug">
          {subtext}
        </span>
      ) : null}
    </span>
  );
}
