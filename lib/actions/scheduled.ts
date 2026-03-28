"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { scheduledTransactions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/types";
import { assignableCategoryError } from "@/lib/categories/assignable";

const ScheduledSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.coerce.number().refine((v) => v !== 0, "Amount must be non-zero"),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  accountId: z.coerce.number().optional(),
  categoryId: z.coerce.number().optional(),
  notes: z.string().optional(),
});

export async function createScheduledTransaction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult<{ id: number }>> {
  const rawAmount = formData.get("amount");
  const amountType = formData.get("amountType");
  const signedAmount =
    rawAmount && amountType === "income"
      ? rawAmount
      : rawAmount
      ? String(-Math.abs(Number(rawAmount)))
      : rawAmount;

  const parsed = ScheduledSchema.safeParse({
    name: formData.get("name"),
    amount: signedAmount,
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    accountId: formData.get("accountId") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { name, amount, frequency, startDate, endDate, accountId, categoryId, notes } =
    parsed.data;

  const catErr = assignableCategoryError(categoryId);
  if (catErr) {
    return { success: false, error: catErr };
  }

  const result = db
    .insert(scheduledTransactions)
    .values({
      name,
      amount,
      frequency,
      startDate,
      endDate: endDate || null,
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      notes: notes ?? null,
    })
    .returning({ id: scheduledTransactions.id })
    .get();

  revalidatePath("/budget");
  return { success: true, data: { id: result.id } };
}

export async function updateScheduledTransaction(
  id: number,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const rawAmount = formData.get("amount");
  const amountType = formData.get("amountType");
  const signedAmount =
    rawAmount && amountType === "income"
      ? rawAmount
      : rawAmount
      ? String(-Math.abs(Number(rawAmount)))
      : rawAmount;

  const parsed = ScheduledSchema.safeParse({
    name: formData.get("name"),
    amount: signedAmount,
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
    accountId: formData.get("accountId") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { name, amount, frequency, startDate, endDate, accountId, categoryId, notes } =
    parsed.data;

  const catErr = assignableCategoryError(categoryId);
  if (catErr) {
    return { success: false, error: catErr };
  }

  db.update(scheduledTransactions)
    .set({
      name,
      amount,
      frequency,
      startDate,
      endDate: endDate || null,
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      notes: notes ?? null,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(scheduledTransactions.id, id))
    .run();

  revalidatePath("/budget");
  return { success: true, data: undefined };
}

export async function deleteScheduledTransaction(id: number): Promise<ActionResult> {
  db.delete(scheduledTransactions).where(eq(scheduledTransactions.id, id)).run();
  revalidatePath("/budget");
  return { success: true, data: undefined };
}

export async function toggleScheduledTransaction(
  id: number,
  isActive: boolean
): Promise<ActionResult> {
  db.update(scheduledTransactions)
    .set({ isActive, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(scheduledTransactions.id, id))
    .run();
  revalidatePath("/budget");
  return { success: true, data: undefined };
}

export async function addAIScheduleSuggestion(data: {
  name: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  categoryId?: number | null;
}): Promise<ActionResult<{ id: number }>> {
  const result = db
    .insert(scheduledTransactions)
    .values({
      name: data.name,
      amount: data.amount,
      frequency: data.frequency,
      startDate: data.startDate,
      endDate: null,
      accountId: null,
      categoryId: data.categoryId ?? null,
      notes: "Added via AI suggestion",
    })
    .returning({ id: scheduledTransactions.id })
    .get();

  revalidatePath("/budget");
  return { success: true, data: { id: result.id } };
}
