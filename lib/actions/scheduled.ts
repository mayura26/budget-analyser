"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignableCategoryError } from "@/lib/categories/assignable";
import { db } from "@/lib/db";
import {
  mutedScheduleSuggestions,
  scheduledTransactions,
} from "@/lib/db/schema";
import {
  canonicalInternalName,
  roundedAmount,
  type ScheduleFrequency,
  scheduleSuggestionSignature,
} from "@/lib/schedules/ai-signature";
import type { ActionResult } from "@/types";

const ScheduledSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.coerce.number().refine((v) => v !== 0, "Amount must be non-zero"),
  frequency: z.enum([
    "weekly",
    "fortnightly",
    "monthly",
    "quarterly",
    "yearly",
  ]),
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
  formData: FormData,
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
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const {
    name,
    amount,
    frequency,
    startDate,
    endDate,
    accountId,
    categoryId,
    notes,
  } = parsed.data;

  const catErr = assignableCategoryError(categoryId);
  if (catErr) {
    return { success: false, error: catErr };
  }

  const result = db
    .insert(scheduledTransactions)
    .values({
      name,
      internalName: canonicalInternalName(name),
      displayName: name,
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
  formData: FormData,
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
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  const {
    name,
    amount,
    frequency,
    startDate,
    endDate,
    accountId,
    categoryId,
    notes,
  } = parsed.data;

  const catErr = assignableCategoryError(categoryId);
  if (catErr) {
    return { success: false, error: catErr };
  }

  db.update(scheduledTransactions)
    .set({
      name,
      internalName: canonicalInternalName(name),
      displayName: name,
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

export async function deleteScheduledTransaction(
  id: number,
): Promise<ActionResult> {
  db.delete(scheduledTransactions)
    .where(eq(scheduledTransactions.id, id))
    .run();
  revalidatePath("/budget");
  return { success: true, data: undefined };
}

export async function toggleScheduledTransaction(
  id: number,
  isActive: boolean,
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
  internalName?: string;
  displayName?: string;
  amount: number;
  frequency: ScheduleFrequency;
  startDate: string;
  categoryId?: number | null;
}): Promise<ActionResult<{ id: number }>> {
  const internalName = canonicalInternalName(data.internalName ?? data.name);
  const displayName = (data.displayName ?? data.name).trim();
  const signature = scheduleSuggestionSignature({
    internalName,
    frequency: data.frequency,
    amount: data.amount,
  });
  const amountRounded = roundedAmount(data.amount);

  const muted = db
    .select({ id: mutedScheduleSuggestions.id })
    .from(mutedScheduleSuggestions)
    .where(eq(mutedScheduleSuggestions.signature, signature))
    .get();
  if (muted) {
    return {
      success: false,
      error: "This suggestion has been muted.",
    };
  }

  const existing = db.select().from(scheduledTransactions).all();
  const duplicate = existing.some((schedule) => {
    const scheduleInternal = canonicalInternalName(
      schedule.internalName ?? schedule.name,
    );
    const scheduleSignature = scheduleSuggestionSignature({
      internalName: scheduleInternal,
      frequency: schedule.frequency,
      amount: schedule.amount,
    });
    return scheduleSignature === signature;
  });

  if (duplicate) {
    return {
      success: false,
      error: "Schedule already exists.",
    };
  }

  const result = db
    .insert(scheduledTransactions)
    .values({
      name: displayName,
      internalName,
      displayName,
      amount: data.amount,
      frequency: data.frequency,
      startDate: data.startDate,
      endDate: null,
      accountId: null,
      categoryId: data.categoryId ?? null,
      notes: `Added via AI suggestion (${signature}, amt=${amountRounded.toFixed(2)})`,
    })
    .returning({ id: scheduledTransactions.id })
    .get();

  revalidatePath("/budget");
  return { success: true, data: { id: result.id } };
}

export async function muteAIScheduleSuggestion(data: {
  internalName: string;
  frequency: ScheduleFrequency;
  amount: number;
  reason?: string;
}): Promise<ActionResult> {
  const internalName = canonicalInternalName(data.internalName);
  const amountRounded = roundedAmount(data.amount);
  const signature = scheduleSuggestionSignature({
    internalName,
    frequency: data.frequency,
    amount: amountRounded,
  });

  db.insert(mutedScheduleSuggestions)
    .values({
      signature,
      internalName,
      frequency: data.frequency,
      amountRounded,
      reason: data.reason?.trim() ? data.reason.trim() : null,
    })
    .onConflictDoNothing({ target: mutedScheduleSuggestions.signature })
    .run();

  revalidatePath("/budget");
  return { success: true, data: undefined };
}
