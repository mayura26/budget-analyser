import { db } from "./index";
import { categories, bankProfiles, accounts } from "./schema";
import { eq } from "drizzle-orm";

const DEFAULT_CATEGORIES = [
  { name: "Groceries", color: "#22c55e", icon: "ShoppingCart", type: "expense" as const },
  { name: "Dining", color: "#f97316", icon: "Utensils", type: "expense" as const },
  { name: "Transport", color: "#3b82f6", icon: "Car", type: "expense" as const },
  { name: "Utilities", color: "#8b5cf6", icon: "Zap", type: "expense" as const },
  { name: "Health", color: "#ec4899", icon: "Heart", type: "expense" as const },
  { name: "Entertainment", color: "#f59e0b", icon: "Film", type: "expense" as const },
  { name: "Shopping", color: "#14b8a6", icon: "ShoppingBag", type: "expense" as const },
  { name: "Travel", color: "#06b6d4", icon: "Plane", type: "expense" as const },
  { name: "Housing", color: "#64748b", icon: "Home", type: "expense" as const },
  { name: "Insurance", color: "#94a3b8", icon: "Shield", type: "expense" as const },
  { name: "Income", color: "#10b981", icon: "TrendingUp", type: "income" as const },
  { name: "Transfer", color: "#6366f1", icon: "ArrowLeftRight", type: "transfer" as const },
  { name: "Credit Card Payment", color: "#a855f7", icon: "CreditCard", type: "transfer" as const },
  { name: "Uncategorised", color: "#9ca3af", icon: "HelpCircle", type: "expense" as const },
];

const DEFAULT_BANK_PROFILES = [
  {
    name: "CommBank",
    dateColumn: "col0",
    descriptionColumn: "col2",
    amountColumn: "col1",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "DD/MM/YYYY",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: JSON.stringify({
      hasHeader: false,
      positionalColumns: {
        date: 0,
        amount: 1,
        description: 2,
      },
    }),
    isSystem: true,
  },
  {
    name: "Monzo",
    dateColumn: "Date",
    descriptionColumn: "Name",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "DD/MM/YYYY",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: null,
    isSystem: true,
  },
  {
    name: "Coles",
    dateColumn: "Date",
    descriptionColumn: "Transaction Details",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    dateFormat: "DD MMM YY",
    skipRows: 0,
    delimiter: ",",
    negativeIsDebit: true,
    extraMappings: null,
    isSystem: true,
  },
];

export async function seedDatabase() {
  // Seed categories if none exist
  const existingCategories = db.select().from(categories).all();
  if (existingCategories.length === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      db.insert(categories).values({ ...cat, isSystem: true }).run();
    }
    console.log("Seeded default categories");
  } else {
    // Insert any new system categories added since initial seed
    const existingNames = new Set(existingCategories.map((c) => c.name));
    for (const cat of DEFAULT_CATEGORIES) {
      if (!existingNames.has(cat.name)) {
        db.insert(categories).values({ ...cat, isSystem: true }).run();
      }
    }
  }

  // Seed bank profiles and refresh built-in profile defaults by name.
  // First handle legacy rename ("Coles Amex" -> "Coles") before insert/update pass.
  const existingProfiles = db.select().from(bankProfiles).all();
  const existingByName = new Map(existingProfiles.map((profile) => [profile.name, profile]));

  const existingColesAmex = existingByName.get("Coles Amex");
  const existingColes = existingByName.get("Coles");
  const colesDefaults = DEFAULT_BANK_PROFILES.find((p) => p.name === "Coles");
  if (existingColesAmex && existingColesAmex.isSystem && !existingColes && colesDefaults) {
    db
      .update(bankProfiles)
      .set(colesDefaults)
      .where(eq(bankProfiles.id, existingColesAmex.id))
      .run();
  }

  // Recompute snapshot after migration so insert/update pass is idempotent.
  const profilesAfterMigration = db.select().from(bankProfiles).all();
  const byNameAfterMigration = new Map(
    profilesAfterMigration.map((profile) => [profile.name, profile])
  );
  for (const profile of DEFAULT_BANK_PROFILES) {
    const existing = byNameAfterMigration.get(profile.name);
    if (!existing) {
      db.insert(bankProfiles).values(profile).run();
      continue;
    }
    if (existing.isSystem) {
      db
        .update(bankProfiles)
        .set(profile)
        .where(eq(bankProfiles.id, existing.id))
        .run();
    }
  }

  // Defensive dedupe guard for duplicate system profiles by name.
  // Keep one canonical "Coles" row, repoint accounts, and remove extras.
  const profilesAfterUpsert = db.select().from(bankProfiles).all();
  const duplicateColes = profilesAfterUpsert
    .filter((profile) => profile.isSystem && profile.name === "Coles")
    .sort((a, b) => a.id - b.id);

  if (duplicateColes.length > 1) {
    const canonical = duplicateColes[0];
    for (const duplicate of duplicateColes.slice(1)) {
      db
        .update(accounts)
        .set({ bankProfileId: canonical.id })
        .where(eq(accounts.bankProfileId, duplicate.id))
        .run();

      db.delete(bankProfiles).where(eq(bankProfiles.id, duplicate.id)).run();
    }
  }

  // Legacy built-in "Coles Amex" was removed; merge any remaining row(s) into Coles.
  const norm = (s: string) => s.trim();
  for (let i = 0; i < 16; i++) {
    const all = db.select().from(bankProfiles).all();
    const colesTarget =
      all.find((p) => norm(p.name) === "Coles" && p.isSystem) ??
      all.find((p) => norm(p.name) === "Coles");
    const legacyAmex = all.find((p) => norm(p.name) === "Coles Amex");
    if (!legacyAmex) break;
    if (colesTarget && legacyAmex.id !== colesTarget.id) {
      db
        .update(accounts)
        .set({ bankProfileId: colesTarget.id })
        .where(eq(accounts.bankProfileId, legacyAmex.id))
        .run();
      db.delete(bankProfiles).where(eq(bankProfiles.id, legacyAmex.id)).run();
      continue;
    }
    if (!colesTarget && colesDefaults) {
      db
        .update(bankProfiles)
        .set(colesDefaults)
        .where(eq(bankProfiles.id, legacyAmex.id))
        .run();
      continue;
    }
    break;
  }

  if (DEFAULT_BANK_PROFILES.length > 0) {
    if (existingProfiles.length === 0) {
      console.log("Seeded default bank profiles");
    } else {
      console.log("Refreshed built-in bank profiles");
    }
  }
}
