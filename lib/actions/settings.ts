"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { settings, bankProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/types";

const SettingsSchema = z.object({
  openai_model: z.string().default("gpt-4o-mini"),
  ai_enabled: z.enum(["true", "false"]).default("false"),
});

export async function saveSettings(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const data = {
    openai_model: formData.get("openai_model") as string || "gpt-4o-mini",
    ai_enabled: (formData.get("ai_enabled") as string) || "false",
  };

  const parsed = SettingsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      db.insert(settings)
        .values({ key, value: String(value), updatedAt: Math.floor(Date.now() / 1000) })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: String(value), updatedAt: Math.floor(Date.now() / 1000) },
        })
        .run();
    }
  }

  revalidatePath("/settings");
  return { success: true, data: undefined };
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

const BankProfileSchema = z.object({
  name: z.string().min(1),
  dateColumn: z.string().min(1),
  descriptionColumn: z.string().min(1),
  amountColumn: z.string().optional(),
  debitColumn: z.string().optional(),
  creditColumn: z.string().optional(),
  dateFormat: z.enum(["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"]),
  skipRows: z.coerce.number().default(0),
  delimiter: z.string().default(","),
  negativeIsDebit: z.boolean().default(true),
});

export async function createBankProfile(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: number }>> {
  const parsed = BankProfileSchema.safeParse({
    name: formData.get("name"),
    dateColumn: formData.get("dateColumn"),
    descriptionColumn: formData.get("descriptionColumn"),
    amountColumn: formData.get("amountColumn") || undefined,
    debitColumn: formData.get("debitColumn") || undefined,
    creditColumn: formData.get("creditColumn") || undefined,
    dateFormat: formData.get("dateFormat"),
    skipRows: formData.get("skipRows") || 0,
    delimiter: formData.get("delimiter") || ",",
    negativeIsDebit: formData.get("negativeIsDebit") === "true",
  });

  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const result = db.insert(bankProfiles).values(parsed.data).returning({ id: bankProfiles.id }).get();
  revalidatePath("/settings");
  return { success: true, data: { id: result.id } };
}

export async function deleteBankProfile(id: number): Promise<ActionResult> {
  const profile = db.select().from(bankProfiles).where(eq(bankProfiles.id, id)).get();
  if (profile?.isSystem) {
    return { success: false, error: "Cannot delete built-in bank profile" };
  }
  db.delete(bankProfiles).where(eq(bankProfiles.id, id)).run();
  revalidatePath("/settings");
  return { success: true, data: undefined };
}
