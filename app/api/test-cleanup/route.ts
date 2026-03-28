import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { categorisationRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Test-only endpoint: only available in non-production environments
export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  // Delete all user-defined categorisation rules (created by tests or users)
  db.delete(categorisationRules).where(eq(categorisationRules.isUserDefined, true)).run();

  return NextResponse.json({ ok: true });
}
