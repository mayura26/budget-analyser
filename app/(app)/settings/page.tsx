export const dynamic = "force-dynamic";

import { BankProfilesSection } from "@/components/settings/bank-profiles-section";
import { SettingsForm } from "@/components/settings/settings-form";
import { db } from "@/lib/db";
import { bankProfiles, settings } from "@/lib/db/schema";

export default function SettingsPage() {
  const allSettings = db.select().from(settings).all();
  const settingsMap = Object.fromEntries(
    allSettings.map((s) => [s.key, s.value ?? ""]),
  );

  const allProfiles = db.select().from(bankProfiles).all();

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsForm
        defaultValues={{
          openai_model: settingsMap.openai_model ?? "gpt-4o-mini",
          ai_enabled: settingsMap.ai_enabled ?? "false",
        }}
      />
      <BankProfilesSection profiles={allProfiles} />
    </div>
  );
}
