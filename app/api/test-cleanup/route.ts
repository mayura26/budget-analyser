import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categorisationRules, transactions } from "@/lib/db/schema";

// Test-only endpoint: only available in non-production environments
export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("transactions") === "1") {
    db.delete(transactions).run();
    revalidatePath("/dashboard");
    revalidatePath("/transactions");
  }

  // Delete all user-defined categorisation rules (created by tests or users)
  db.delete(categorisationRules)
    .where(eq(categorisationRules.isUserDefined, true))
    .run();

  return NextResponse.json({ ok: true });
}
