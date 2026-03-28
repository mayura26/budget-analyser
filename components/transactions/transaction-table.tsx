"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LinkTransferPopover } from "@/components/transactions/link-transfer-popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteTransaction,
  setTransactionCategoryConfirmed,
  updateTransactionCategory,
} from "@/lib/actions/transactions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Account, Category } from "@/types";

type Row = {
  id: number;
  date: string;
  description: string;
  amount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryType: string | null;
  accountId: number;
  accountName: string | null;
  accountColor: string | null;
  categorySource: string | null;
  categoryConfirmed: boolean;
  notes: string | null;
  linkedTransactionId: number | null;
};

const col = createColumnHelper<Row>();

export function TransactionTable({
  rows,
  accounts,
  categories,
  currentFilters,
}: {
  rows: Row[];
  accounts: Account[];
  categories: Category[];
  currentFilters: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(currentFilters.search ?? "");

  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(currentFilters)) {
        if (v && k !== key) params.set(k, v);
      }
      if (value) params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [currentFilters, pathname, router],
  );

  const columns = [
    col.accessor("date", {
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 text-xs font-medium"
          onClick={() => column.toggleSorting()}
        >
          Date
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-50" />
          )}
        </button>
      ),
      cell: (info) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
    col.accessor("description", {
      header: "Description",
      cell: (info) => (
        <div className="min-w-0">
          <p className="text-sm whitespace-normal wrap-break-word">
            {info.getValue()}
          </p>
          {info.row.original.notes && (
            <p className="text-xs text-muted-foreground whitespace-normal wrap-break-word mt-0.5">
              {info.row.original.notes}
            </p>
          )}
        </div>
      ),
    }),
    col.accessor("accountName", {
      header: "Account",
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: row.accountColor ?? "#6366f1" }}
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {info.getValue() ?? "Unknown"}
            </span>
          </div>
        );
      },
    }),
    col.accessor("categoryName", {
      header: "Category",
      cell: (info) => {
        const row = info.row.original;
        return (
          <CategoryCell
            transactionId={row.id}
            categoryId={row.categoryId}
            categoryName={info.getValue()}
            categoryColor={row.categoryColor}
            categoryConfirmed={row.categoryConfirmed}
            categories={categories}
          />
        );
      },
    }),
    col.display({
      id: "confirm",
      header: () => (
        <span className="text-muted-foreground" title="Confirm category">
          OK
        </span>
      ),
      cell: (info) => (
        <ConfirmCell
          transactionId={info.row.original.id}
          categoryId={info.row.original.categoryId}
          categoryConfirmed={info.row.original.categoryConfirmed}
        />
      ),
    }),
    col.accessor("amount", {
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 text-xs font-medium ml-auto"
          onClick={() => column.toggleSorting()}
        >
          Amount
          {column.getIsSorted() === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : column.getIsSorted() === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-50" />
          )}
        </button>
      ),
      cell: (info) => {
        const amount = info.getValue();
        const row = info.row.original;
        const isTransfer = row.categoryType === "transfer";
        return (
          <div className="flex items-center justify-end gap-1">
            {isTransfer && (
              <LinkTransferPopover
                transactionId={row.id}
                linkedTransactionId={row.linkedTransactionId}
              />
            )}
            <span
              className={`text-sm font-medium whitespace-nowrap ${
                amount < 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {amount < 0 ? "-" : "+"}
              {formatCurrency(amount)}
            </span>
          </div>
        );
      },
    }),
    col.display({
      id: "actions",
      cell: (info) => <DeleteCell transactionId={info.row.original.id} />,
    }),
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Input
          placeholder="Search transactions…"
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            updateFilter("search", e.target.value || undefined);
          }}
          className="w-full sm:max-w-xs h-8 text-sm"
        />

        <Select
          value={currentFilters.accountId ?? "all"}
          onValueChange={(v) =>
            updateFilter("accountId", v === "all" ? undefined : v)
          }
        >
          <SelectTrigger className="h-8 text-sm w-full sm:w-40">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.categoryId ?? "all"}
          onValueChange={(v) =>
            updateFilter("categoryId", v === "all" ? undefined : v)
          }
        >
          <SelectTrigger className="h-8 text-sm w-full sm:w-44">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorised</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentFilters.needsReview === "1" ? "needsReview" : "all"}
          onValueChange={(v) =>
            updateFilter("needsReview", v === "needsReview" ? "1" : undefined)
          }
        >
          <SelectTrigger
            className="h-8 text-sm w-full sm:w-48"
            data-testid="filter-needs-review"
          >
            <SelectValue placeholder="Review status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All review statuses</SelectItem>
            <SelectItem value="needsReview">Needs confirmation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-9 text-xs",
                      header.column.id === "accountName" &&
                        "hidden sm:table-cell",
                      header.column.id === "confirm" && "w-10 px-1 text-center",
                    )}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground text-sm"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="min-h-10">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-2",
                        cell.column.id === "accountName" &&
                          "hidden sm:table-cell",
                        cell.column.id === "description" && "align-top",
                        cell.column.id === "confirm" && "w-10 px-1 text-center",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {table.getRowModel().rows.length} of {rows.length} transactions
      </p>
    </div>
  );
}

function ConfirmCell({
  transactionId,
  categoryId,
  categoryConfirmed,
}: {
  transactionId: number;
  categoryId: number | null;
  categoryConfirmed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const disabled = categoryId === null;

  return (
    <input
      type="checkbox"
      data-testid="confirm-category"
      title={disabled ? "Set a category first" : "Confirm category"}
      disabled={disabled || pending}
      checked={Boolean(categoryId && categoryConfirmed)}
      onChange={async (e) => {
        setPending(true);
        await setTransactionCategoryConfirmed(transactionId, e.target.checked);
        router.refresh();
        setPending(false);
      }}
      className="h-4 w-4 rounded border-input accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function CategoryCell({
  transactionId,
  categoryId,
  categoryName,
  categoryColor,
  categoryConfirmed,
  categories,
}: {
  transactionId: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryConfirmed: boolean;
  categories: Category[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  if (editing) {
    return (
      <Select
        value={categoryId ? String(categoryId) : "none"}
        onValueChange={async (v) => {
          setPending(true);
          setEditing(false);
          const newCategoryId = v === "none" ? null : parseInt(v, 10);
          await updateTransactionCategory(transactionId, newCategoryId);
          setPending(false);
        }}
        open
        onOpenChange={(open) => !open && setEditing(false)}
      >
        <SelectTrigger className="h-7 text-xs w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Uncategorised</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={pending}
      className="hover:opacity-80 transition-opacity"
    >
      {categoryName ? (
        <Badge
          variant="secondary"
          className={cn(
            "text-xs font-normal",
            categoryId !== null &&
              !categoryConfirmed &&
              "ring-2 ring-amber-500/40",
          )}
          style={{
            backgroundColor: `${categoryColor}20`,
            color: categoryColor ?? undefined,
          }}
        >
          {categoryName}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground italic">
          Uncategorised
        </span>
      )}
    </button>
  );
}

function DeleteCell({ transactionId }: { transactionId: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-6 px-2 text-xs"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            await deleteTransaction(transactionId);
          }}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <button
      aria-label="Delete"
      data-testid="delete-transaction"
      onClick={() => setConfirming(true)}
      className="p-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
