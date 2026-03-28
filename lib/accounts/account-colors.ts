import { asc, eq } from "drizzle-orm";
import { deriveAccountGroupMemberColor } from "@/lib/accounts/account-member-colors";
import { db } from "@/lib/db";
import { accountGroups, accounts } from "@/lib/db/schema";

/** Assign each account in the group a swatch derived from the group colour (by `id` order). */
export function recomputeAccountColorsForGroup(groupId: number): void {
  const group = db
    .select()
    .from(accountGroups)
    .where(eq(accountGroups.id, groupId))
    .get();
  if (!group) return;

  const rows = db
    .select({ id: accounts.id, colorCustom: accounts.colorCustom })
    .from(accounts)
    .where(eq(accounts.groupId, groupId))
    .orderBy(asc(accounts.id))
    .all();

  let derivedIdx = 0;
  for (const row of rows) {
    if (row.colorCustom) continue;
    const color = deriveAccountGroupMemberColor(group.color, derivedIdx);
    derivedIdx += 1;
    db.update(accounts).set({ color }).where(eq(accounts.id, row.id)).run();
  }
}

/** One-time / idempotent: fix colours for all accounts that belong to a group. */
export function recomputeAllGroupedAccountColors(): void {
  const groups = db.select({ id: accountGroups.id }).from(accountGroups).all();

  for (const g of groups) {
    recomputeAccountColorsForGroup(g.id);
  }
}
