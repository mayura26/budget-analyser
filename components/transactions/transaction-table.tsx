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
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  Minus,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { CategorySelectGrouped } from "@/components/categories/category-select-grouped";
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
import { parseCategoryDisplayName } from "@/lib/categories/display-name";
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

function categoryTitleFromList(categories: Category[], id: number | null) {
  if (id == null) return "";
  const c = categories.find((x) => x.id === id);
  return c ? parseCategoryDisplayName(c.name).title : "";
}

function categoryFilterTriggerLabel(categories: Category[], value: string) {
  if (value === "all") return "All categories";
  if (value === "none") return "Not processed";
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) return "All categories";
  return categoryTitleFromList(categories, id) || "Unknown";
}

export function TransactionTable({
  rows,
  accounts,
  categories,
  categoryMains,
  currentFilters,
}: {
  rows: Row[];
  accounts: Account[];
  categories: Category[];
  /** Main groups for optgroup labels (optional, falls back to flat list). */
  categoryMains?: Category[];
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
            categoryMains={categoryMains}
          />
        );
      },
    }),
    col.display({
      id: "confirm",
      header: () => (
        <span
          className="inline-flex flex-col items-center justify-center text-muted-foreground"
          title="Category verified"
        >
          <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden />
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
          <SelectTrigger
            className="h-8 text-sm w-full sm:w-44"
            title={(() => {
              const v = currentFilters.categoryId;
              if (!v || v === "all" || v === "none") return undefined;
              const id = Number.parseInt(v, 10);
              if (Number.isNaN(id)) return undefined;
              return categories.find((c) => c.id === id)?.name;
            })()}
          >
            <span className="truncate">
              {categoryFilterTriggerLabel(
                categories,
                currentFilters.categoryId ?? "all",
              )}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Not processed</SelectItem>
            {categoryMains && categoryMains.length > 0 ? (
              <CategorySelectGrouped
                categories={categories}
                mains={categoryMains}
              />
            ) : (
              categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <CategoryNameParts name={c.name} variant="select" />
                </SelectItem>
              ))
            )}
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
                    aria-label={
                      header.column.id === "confirm" ? "Verified" : undefined
                    }
                    className={cn(
                      "h-9 text-xs",
                      header.column.id === "accountName" &&
                        "hidden sm:table-cell",
                      header.column.id === "confirm" &&
                        "w-12 min-w-12 px-1 text-center",
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
                        cell.column.id === "confirm" &&
                          "w-12 min-w-12 px-1 text-center",
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
  const verified = Boolean(categoryId && categoryConfirmed);
  const needsAttention = categoryId !== null && !categoryConfirmed;

  return (
    <label
      className={cn(
        "relative flex items-center justify-center rounded-md min-h-9 min-w-9 -my-0.5 mx-auto transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
        disabled && "cursor-not-allowed opacity-60",
        !disabled &&
          needsAttention &&
          "bg-amber-500/15 ring-1 ring-amber-500/50 dark:bg-amber-500/20",
        !disabled && verified && "bg-emerald-500/10 dark:bg-emerald-500/15",
        !disabled && !pending && "cursor-pointer",
        pending && "opacity-70",
      )}
      title={
        disabled
          ? "Set a category first"
          : verified
            ? "Category verified — click to unmark"
            : "Mark category as verified"
      }
    >
      <input
        type="checkbox"
        data-testid="confirm-category"
        aria-label={
          disabled
            ? "Set a category before marking as verified"
            : verified
              ? "Category verified"
              : "Mark category as verified"
        }
        disabled={disabled || pending}
        checked={verified}
        onChange={async (e) => {
          setPending(true);
          await setTransactionCategoryConfirmed(
            transactionId,
            e.target.checked,
          );
          router.refresh();
          setPending(false);
        }}
        className="sr-only"
      />
      <span className="pointer-events-none flex items-center justify-center">
        {disabled ? (
          <Minus className="h-4 w-4 text-muted-foreground/80" aria-hidden />
        ) : verified ? (
          <CircleCheck
            className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400"
            aria-hidden
            strokeWidth={2}
          />
        ) : (
          <CircleAlert
            className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400"
            aria-hidden
            strokeWidth={2}
          />
        )}
      </span>
    </label>
  );
}

function CategoryCell({
  transactionId,
  categoryId,
  categoryName,
  categoryColor,
  categoryConfirmed,
  categories,
  categoryMains,
}: {
  transactionId: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryConfirmed: boolean;
  categories: Category[];
  categoryMains?: Category[];
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
          const newCategoryId = v === "none" ? null : Number.parseInt(v, 10);
          await updateTransactionCategory(transactionId, newCategoryId);
          setPending(false);
        }}
        open
        onOpenChange={(open) => !open && setEditing(false)}
      >
        <SelectTrigger
          className="h-7 text-xs w-36"
          title={
            categoryId != null
              ? (categories.find((c) => c.id === categoryId)?.name ?? undefined)
              : undefined
          }
        >
          <span className="truncate">
            {categoryId == null
              ? "Not processed"
              : categoryTitleFromList(categories, categoryId) || "Unknown"}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not processed</SelectItem>
          {categoryMains && categoryMains.length > 0 ? (
            <CategorySelectGrouped
              categories={categories}
              mains={categoryMains}
            />
          ) : (
            categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <CategoryNameParts name={c.name} variant="select" />
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      title={categoryName ?? undefined}
      className="hover:opacity-80 transition-opacity"
    >
      {categoryName ? (
        <Badge
          variant="secondary"
          className={cn(
            "max-w-[14rem] text-xs font-medium py-0.5 px-2 h-auto min-h-6 leading-tight",
            categoryId !== null &&
              !categoryConfirmed &&
              "ring-2 ring-amber-500/40",
          )}
          style={{
            backgroundColor: `${categoryColor}20`,
            color: categoryColor ?? undefined,
          }}
        >
          <span className="truncate">
            {parseCategoryDisplayName(categoryName).title}
          </span>
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground italic">
          Not processed
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
