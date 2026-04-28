export const dynamic = "force-dynamic";

import { ImportWizard } from "@/components/import/import-wizard";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { accounts, bankProfiles } from "@/lib/db/schema";

export default function ImportPage() {
  const allAccounts = db.select().from(accounts).all();
  const allProfiles = db.select().from(bankProfiles).all();

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <PageHeader
        title="Import Transactions"
        subtitle="Upload a CSV bank statement. Duplicate transactions will be automatically detected."
      />
      <ImportWizard accounts={allAccounts} bankProfiles={allProfiles} />
    </div>
  );
}
