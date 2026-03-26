export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { accounts, categories } from "@/lib/db/schema";
import { ManualTransactionForm } from "@/components/transactions/manual-entry-form";

export default function NewTransactionPage() {
  const allAccounts = db.select().from(accounts).all();
  const allCategories = db.select().from(categories).all();

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">Add Transaction</h1>
      <ManualTransactionForm accounts={allAccounts} categories={allCategories} />
    </div>
  );
}
