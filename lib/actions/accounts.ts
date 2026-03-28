"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeAccountColorsForGroup } from "@/lib/accounts/account-colors";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import type { ActionResult } from "@/types";

const AccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  bankProfileId: z.coerce.number().optional(),
  groupId: z.coerce.number().optional(),
  currency: z.string().min(3).max(3).default("AUD"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color")
    .default("#6366f1"),
});

export async function createAccount(
  _prev: ActionResult | null,
  formData: FormData,
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
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const groupId = parsed.data.groupId ?? null;
  const color = groupId != null ? "#6366f1" : parsed.data.color;

  const result = db
    .insert(accounts)
    .values({ ...parsed.data, groupId, color })
    .returning({ id: accounts.id })
    .get();

  if (groupId != null) {
    recomputeAccountColorsForGroup(groupId);
  }

  revalidatePath("/accounts");
  revalidatePath("/import");
  return { success: true, data: { id: result.id } };
}

export async function updateAccount(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
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
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const existing = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!existing) {
    return { success: false, error: "Account not found" };
  }

  const newGroupId = parsed.data.groupId ?? null;
  const oldGroupId = existing.groupId;

  const base = {
    name: parsed.data.name,
    bankProfileId: parsed.data.bankProfileId ?? null,
    currency: parsed.data.currency,
    groupId: newGroupId,
  };

  if (newGroupId == null) {
    db.update(accounts)
      .set({ ...base, color: parsed.data.color })
      .where(eq(accounts.id, id))
      .run();
  } else {
    db.update(accounts).set(base).where(eq(accounts.id, id)).run();
    recomputeAccountColorsForGroup(newGroupId);
  }

  if (oldGroupId != null && oldGroupId !== newGroupId) {
    recomputeAccountColorsForGroup(oldGroupId);
  }

  revalidatePath("/accounts");
  return { success: true, data: undefined };
}

export async function deleteAccount(id: number): Promise<ActionResult> {
  const row = db
    .select({ groupId: accounts.groupId })
    .from(accounts)
    .where(eq(accounts.id, id))
    .get();

  db.delete(accounts).where(eq(accounts.id, id)).run();

  if (row?.groupId != null) {
    recomputeAccountColorsForGroup(row.groupId);
  }

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  return { success: true, data: undefined };
}
