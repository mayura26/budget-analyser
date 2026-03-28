import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("transactionId");
  const transactionId = idParam ? parseInt(idParam, 10) : NaN;

  if (Number.isNaN(transactionId)) {
    return NextResponse.json(
      { error: "Invalid transactionId" },
      { status: 400 },
    );
  }

  const source = db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      accountId: transactions.accountId,
      groupId: accounts.groupId,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.id, transactionId))
    .get();

  if (!source) {
    return NextResponse.json(
      { error: "Transaction not found" },
      { status: 404 },
    );
  }

  const candidates = db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      accountId: transactions.accountId,
      accountName: sql<string>`COALESCE(${accounts.name}, 'Unknown')`,
      groupId: accounts.groupId,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(
        ne(transactions.accountId, source.accountId),
        isNull(transactions.linkedTransactionId),
        sql`ABS(${transactions.amount}) = ABS(${source.amount})`,
        sql`SIGN(${transactions.amount}) != SIGN(${source.amount})`,
        sql`julianday(${transactions.date}) BETWEEN julianday(${source.date}) - 2 AND julianday(${source.date}) + 2`,
      ),
    )
    .limit(10)
    .all();

  const result = candidates.map((c) => ({
    transactionId: c.id,
    date: c.date,
    description: c.description,
    amount: c.amount,
    accountId: c.accountId,
    accountName: c.accountName,
    sameGroup:
      source.groupId !== null &&
      c.groupId !== null &&
      source.groupId === c.groupId,
  }));

  result.sort((a, b) => (b.sameGroup ? 1 : 0) - (a.sameGroup ? 1 : 0));

  return NextResponse.json({ data: result });
}
