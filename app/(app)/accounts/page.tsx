export const dynamic = "force-dynamic";

import { eq, sql } from "drizzle-orm";
import { Wallet } from "lucide-react";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { AccountGroupHeader } from "@/components/accounts/account-group-header";
import { CreateGroupDialog } from "@/components/accounts/create-group-dialog";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getHomeCurrency } from "@/lib/currency/home";
import { db } from "@/lib/db";
import {
  accountGroups,
  accounts,
  bankProfiles,
  importBatches,
  transactions,
} from "@/lib/db/schema";
import type { AccountGroup } from "@/types";

const IMPORT_FRESHNESS_CLASSES = {
  fresh:
    "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  medium:
    "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  warning:
    "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-200",
  problem:
    "border-red-200 bg-red-100 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getImportFreshnessBadge(lastImportedAt: number | null): {
  className: string;
  label: string;
  title?: string;
} {
  if (!lastImportedAt) {
    return {
      className: IMPORT_FRESHNESS_CLASSES.problem,
      label: "Last import: Never imported",
    };
  }

  const importedDate = new Date(lastImportedAt * 1000);
  const dayDiff = Math.max(
    0,
    Math.floor(
      (startOfLocalDay(new Date()).getTime() -
        startOfLocalDay(importedDate).getTime()) /
        MS_PER_DAY,
    ),
  );

  if (dayDiff === 0) {
    return {
      className: IMPORT_FRESHNESS_CLASSES.fresh,
      label: "Last import: Today",
      title: importedDate.toLocaleString(),
    };
  }

  if (dayDiff <= 7) {
    return {
      className: IMPORT_FRESHNESS_CLASSES.medium,
      label: `Last import: ${dayDiff}d ago`,
      title: importedDate.toLocaleString(),
    };
  }

  if (dayDiff < 30) {
    return {
      className: IMPORT_FRESHNESS_CLASSES.warning,
      label: `Last import: ${dayDiff}d ago`,
      title: importedDate.toLocaleString(),
    };
  }

  return {
    className: IMPORT_FRESHNESS_CLASSES.problem,
    label: "Last import: 30d+ ago",
    title: importedDate.toLocaleString(),
  };
}

export default function AccountsPage() {
  const defaultHomeCurrency = getHomeCurrency();
  const allProfiles = db.select().from(bankProfiles).all();
  const allGroups = db.select().from(accountGroups).all() as AccountGroup[];

  const accountRows = db
    .select({
      id: accounts.id,
      name: accounts.name,
      currency: accounts.currency,
      color: accounts.color,
      colorCustom: accounts.colorCustom,
      bankProfileId: accounts.bankProfileId,
      groupId: accounts.groupId,
      bankProfileName: sql<string>`${bankProfiles.name}`,
      transactionCount: sql<number>`COUNT(DISTINCT ${transactions.id})`,
      lastImportedAt: sql<number | null>`MAX(${importBatches.importedAt})`,
      latestTransactionDate: sql<string | null>`MAX(${transactions.date})`,
    })
    .from(accounts)
    .leftJoin(bankProfiles, eq(accounts.bankProfileId, bankProfiles.id))
    .leftJoin(transactions, eq(accounts.id, transactions.accountId))
    .leftJoin(importBatches, eq(accounts.id, importBatches.accountId))
    .groupBy(accounts.id)
    .all();

  // Partition into grouped and ungrouped
  const groupMap = new Map<number, typeof accountRows>();
  const ungrouped: typeof accountRows = [];

  const groupAccountIdsByGroup: Record<number, number[]> = {};

  for (const row of accountRows) {
    if (row.groupId) {
      const existing = groupMap.get(row.groupId) ?? [];
      existing.push(row);
      groupMap.set(row.groupId, existing);
      const idList = groupAccountIdsByGroup[row.groupId] ?? [];
      idList.push(row.id);
      groupAccountIdsByGroup[row.groupId] = idList;
    } else {
      ungrouped.push(row);
    }
  }

  for (const k of Object.keys(groupAccountIdsByGroup)) {
    const gid = Number(k);
    groupAccountIdsByGroup[gid].sort((a, b) => a - b);
  }

  function AccountCard({ account }: { account: (typeof accountRows)[0] }) {
    const importFreshness = getImportFreshnessBadge(account.lastImportedAt);
    const latestTransactionText =
      account.latestTransactionDate ?? "No transactions yet";

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
                defaultHomeCurrency={defaultHomeCurrency}
                account={{
                  id: account.id,
                  name: account.name,
                  bankProfileId: account.bankProfileId,
                  groupId: account.groupId,
                  currency: account.currency,
                  color: account.color,
                  colorCustom: account.colorCustom,
                  createdAt: 0,
                }}
              />
              <DeleteAccountButton id={account.id} name={account.name} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              {account.currency} · {account.transactionCount} transactions
            </p>
            <Badge
              variant="outline"
              className={importFreshness.className}
              title={importFreshness.title}
            >
              {importFreshness.label}
            </Badge>
            <p>Latest transaction: {latestTransactionText}</p>
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
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Accounts"
        actions={
          <>
            <CreateGroupDialog />
            <AccountDialog
              bankProfiles={allProfiles}
              groups={allGroups}
              groupAccountIdsByGroup={groupAccountIdsByGroup}
              defaultHomeCurrency={defaultHomeCurrency}
            />
          </>
        }
      />

      {!hasAnyAccounts && !hasAnyGroups ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account to start importing transactions and tracking balances."
          action={
            <AccountDialog
              bankProfiles={allProfiles}
              groups={allGroups}
              groupAccountIdsByGroup={groupAccountIdsByGroup}
              defaultHomeCurrency={defaultHomeCurrency}
            />
          }
        />
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
                  <p className="text-sm text-muted-foreground pl-4">
                    No accounts in this group.
                  </p>
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
