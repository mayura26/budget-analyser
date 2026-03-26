export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { accounts, bankProfiles } from "@/lib/db/schema";
import { ImportWizard } from "@/components/import/import-wizard";

export default function ImportPage() {
  const allAccounts = db.select().from(accounts).all();
  const allProfiles = db.select().from(bankProfiles).all();

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">Import Transactions</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Upload a CSV bank statement. Duplicate transactions will be automatically detected.
      </p>
      <ImportWizard accounts={allAccounts} bankProfiles={allProfiles} />
    </div>
  );
}
