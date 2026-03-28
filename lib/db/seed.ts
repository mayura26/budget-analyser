import { db } from "./index";
import { categories, bankProfiles, accounts } from "./schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  MAIN_GROUP_DEFAULTS,
  MAIN_GROUP_NAMES,
  refreshSubcategoryColorsForAllMains,
} from "./category-hierarchy-migrate";

type MainName = (typeof MAIN_GROUP_NAMES)[number];

const DEFAULT_SUBS: {
  name: string;
  main: MainName;
  icon: string;
  type: "income" | "expense" | "transfer";
}[] = [
  { name: "Income", main: "Money in", icon: "TrendingUp", type: "income" },
  { name: "Gifts", main: "Money in", icon: "Gift", type: "income" },
  { name: "Groceries", main: "Living costs", icon: "ShoppingCart", type: "expense" },
  { name: "Dining", main: "Living costs", icon: "Utensils", type: "expense" },
  { name: "Transport", main: "Living costs", icon: "Car", type: "expense" },
  { name: "Utilities", main: "Living costs", icon: "Zap", type: "expense" },
  { name: "Health", main: "Living costs", icon: "Heart", type: "expense" },
  { name: "Housing", main: "Living costs", icon: "Home", type: "expense" },
  { name: "Insurance", main: "Living costs", icon: "Shield", type: "expense" },
  { name: "Investments", main: "Savings", icon: "LineChart", type: "expense" },
  { name: "Entertainment", main: "Enjoyment", icon: "Film", type: "expense" },
  { name: "Shopping", main: "Enjoyment", icon: "ShoppingBag", type: "expense" },
  { name: "Travel", main: "One-off & irregular", icon: "Plane", type: "expense" },
  { name: "Holidays", main: "One-off & irregular", icon: "Palmtree", type: "expense" },
  { name: "Misc", main: "One-off & irregular", icon: "HelpCircle", type: "expense" },
  { name: "Transfer", main: "Transfers", icon: "ArrowLeftRight", type: "transfer" },
  { name: "Credit Card Payment", main: "Transfers", icon: "CreditCard", type: "transfer" },
];

function ensureSystemCategories(): void {
  let inserted = false;
  for (const main of MAIN_GROUP_DEFAULTS) {
    const exists = db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, main.name), isNull(categories.parentId)))
      .get();
    if (!exists) {
      db.insert(categories).values({ ...main, parentId: null, isSystem: true }).run();
      inserted = true;
    }
  }

  const mainId = (name: MainName): number | undefined =>
    db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, name), isNull(categories.parentId)))
      .get()?.id;

  for (const sub of DEFAULT_SUBS) {
    const pid = mainId(sub.main);
    if (!pid) continue;
    const exists = db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.name, sub.name), eq(categories.parentId, pid)))
      .get();
    if (!exists) {
      db.insert(categories).values({
        name: sub.name,
        icon: sub.icon,
        type: sub.type,
        parentId: pid,
        color: "#6366f1",
        isSystem: true,
      }).run();
      inserted = true;
    }
  }

  if (inserted) {
    refreshSubcategoryColorsForAllMains();
  }
}

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
  ensureSystemCategories();

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
