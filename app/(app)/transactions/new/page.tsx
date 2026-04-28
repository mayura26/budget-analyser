export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/layout/page-header";
import { ManualTransactionForm } from "@/components/transactions/manual-entry-form";
import { filterAssignableCategories } from "@/lib/categories/assignable";
import { db } from "@/lib/db";
import { accounts, categories } from "@/lib/db/schema";
import type { Category } from "@/types";

export default function NewTransactionPage() {
  const allAccounts = db.select().from(accounts).all();
  const allCatsRaw = db.select().from(categories).all() as Category[];
  const categoryMains = allCatsRaw
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const assignable = filterAssignableCategories(allCatsRaw);

  return (
    <div className="p-4 sm:p-6 max-w-lg space-y-6">
      <PageHeader title="Add Transaction" />
      <ManualTransactionForm
        accounts={allAccounts}
        categories={assignable}
        categoryMains={categoryMains}
      />
    </div>
  );
}
