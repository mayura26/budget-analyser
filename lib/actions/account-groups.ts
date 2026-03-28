"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recomputeAccountColorsForGroup } from "@/lib/accounts/account-colors";
import { db } from "@/lib/db";
import { accountGroups } from "@/lib/db/schema";
import type { ActionResult } from "@/types";

const AccountGroupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Invalid color")
    .default("#6366f1"),
});

export async function createAccountGroup(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ id: number }>> {
  const parsed = AccountGroupSchema.safeParse({
    name: formData.get("name"),
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

  const result = db
    .insert(accountGroups)
    .values(parsed.data)
    .returning({ id: accountGroups.id })
    .get();

  revalidatePath("/accounts");
  return { success: true, data: { id: result.id } };
}

export async function updateAccountGroup(
  id: number,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = AccountGroupSchema.safeParse({
    name: formData.get("name"),
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

  db.update(accountGroups)
    .set(parsed.data)
    .where(eq(accountGroups.id, id))
    .run();

  recomputeAccountColorsForGroup(id);

  revalidatePath("/accounts");
  return { success: true, data: undefined };
}

export async function deleteAccountGroup(id: number): Promise<ActionResult> {
  db.delete(accountGroups).where(eq(accountGroups.id, id)).run();
  revalidatePath("/accounts");
  return { success: true, data: undefined };
}
