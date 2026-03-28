export const dynamic = "force-dynamic";

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
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">Add Transaction</h1>
      <ManualTransactionForm
        accounts={allAccounts}
        categories={assignable}
        categoryMains={categoryMains}
      />
    </div>
  );
}
