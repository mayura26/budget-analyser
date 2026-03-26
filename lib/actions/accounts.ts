"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/types";

const AccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  bankProfileId: z.coerce.number().optional(),
  groupId: z.coerce.number().optional(),
  currency: z.string().min(3).max(3).default("AUD"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color").default("#6366f1"),
});

export async function createAccount(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: number }>> {
  const parsed = AccountSchema.safeParse({
    name: formData.get("name"),
    bankProfileId: formData.get("bankProfileId") || undefined,
    groupId: formData.get("groupId") || undefined,
    currency: formData.get("currency") || "AUD",
    color: formData.get("color") || "#6366f1",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const result = db
    .insert(accounts)
    .values({ ...parsed.data, groupId: parsed.data.groupId ?? null })
    .returning({ id: accounts.id })
    .get();

  revalidatePath("/accounts");
  revalidatePath("/import");
  return { success: true, data: { id: result.id } };
}

export async function updateAccount(
  id: number,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = AccountSchema.safeParse({
    name: formData.get("name"),
    bankProfileId: formData.get("bankProfileId") || undefined,
    groupId: formData.get("groupId") || undefined,
    currency: formData.get("currency") || "AUD",
    color: formData.get("color") || "#6366f1",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  db.update(accounts)
    .set({ ...parsed.data, groupId: parsed.data.groupId ?? null })
    .where(eq(accounts.id, id))
    .run();

  revalidatePath("/accounts");
  return { success: true, data: undefined };
}

export async function deleteAccount(id: number): Promise<ActionResult> {
  db.delete(accounts).where(eq(accounts.id, id)).run();
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  return { success: true, data: undefined };
}
