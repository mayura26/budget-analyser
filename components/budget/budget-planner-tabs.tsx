"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Tabs } from "@/components/ui/tabs";

export function BudgetPlannerTabs({
  month,
  initialTab,
  children,
}: {
  month: string;
  initialTab: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);

  return (
    <Tabs
      value={tab}
      activationMode="manual"
      onValueChange={(value) => {
        if (value === "spend-analysis" || initialTab === "spend-analysis") {
          const params = new URLSearchParams({ month });
          if (value !== "monthly-budget") params.set("tab", value);
          router.push(`/budget?${params}`, { scroll: false });
          return;
        }
        setTab(value);
      }}
    >
      {children}
    </Tabs>
  );
}
