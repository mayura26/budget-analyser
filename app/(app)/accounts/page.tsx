export const dynamic = "force-dynamic";
import { db } from "@/lib/db";
import { accounts, accountGroups, bankProfiles, transactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import { AccountGroupHeader } from "@/components/accounts/account-group-header";
import { CreateGroupDialog } from "@/components/accounts/create-group-dialog";
import type { AccountGroup } from "@/types";

export default function AccountsPage() {
  const allProfiles = db.select().from(bankProfiles).all();
  const allGroups = db.select().from(accountGroups).all() as AccountGroup[];

  const accountRows = db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      color: accounts.color,
      bankProfileId: accounts.bankProfileId,
      groupId: accounts.groupId,
      bankProfileName: sql<string>`${bankProfiles.name}`,
      transactionCount: sql<number>`COUNT(${transactions.id})`,
    })
    .from(accounts)
    .leftJoin(bankProfiles, eq(accounts.bankProfileId, bankProfiles.id))
    .leftJoin(transactions, eq(accounts.id, transactions.accountId))
    .groupBy(accounts.id)
    .all();

  // Partition into grouped and ungrouped
  const groupMap = new Map<number, typeof accountRows>();
  const ungrouped: typeof accountRows = [];

  for (const row of accountRows) {
    if (row.groupId) {
      const existing = groupMap.get(row.groupId) ?? [];
      existing.push(row);
      groupMap.set(row.groupId, existing);
    } else {
      ungrouped.push(row);
    }
  }

  function AccountCard({ account }: { account: (typeof accountRows)[0] }) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: account.color }}
              />
              <CardTitle className="text-base">{account.name}</CardTitle>
            </div>
            <div className="flex gap-1">
              <AccountDialog
                bankProfiles={allProfiles}
                groups={allGroups}
                account={{
                  id: account.id,
                  name: account.name,
                  bankProfileId: account.bankProfileId,
                  groupId: account.groupId,
                  currency: account.currency,
                  color: account.color,
                  createdAt: 0,
                }}
              />
              <DeleteAccountButton id={account.id} name={account.name} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{account.currency} · {account.transactionCount} transactions</p>
            {account.bankProfileName && (
              <Badge variant="secondary" className="text-xs">
                {account.bankProfileName}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAnyAccounts = accountRows.length > 0;
  const hasAnyGroups = allGroups.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <div className="flex gap-2">
          <CreateGroupDialog />
          <AccountDialog bankProfiles={allProfiles} groups={allGroups} />
        </div>
      </div>

      {!hasAnyAccounts && !hasAnyGroups ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No accounts yet.</p>
            <p className="text-sm mt-1">Add your first account to start importing transactions.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {allGroups.map((group) => {
            const groupAccounts = groupMap.get(group.id) ?? [];
            return (
              <div key={group.id}>
                <AccountGroupHeader
                  group={group}
                  accountCount={groupAccounts.length}
                />
                {groupAccounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-4">No accounts in this group.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
                    {groupAccounts.map((account) => (
                      <AccountCard key={account.id} account={account} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {ungrouped.length > 0 && (
            <div>
              {allGroups.length > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Other accounts
                  </span>
                  <div className="flex-1 h-px bg-border ml-1" />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
                {ungrouped.map((account) => (
                  <AccountCard key={account.id} account={account} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
