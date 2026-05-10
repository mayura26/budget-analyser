"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
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
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CategoryNameParts } from "@/components/categories/category-name-parts";
import { CategorySelectGrouped } from "@/components/categories/category-select-grouped";
import { CreateRuleDialog } from "@/components/transactions/create-rule-dialog";
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
  bulkDeleteTransactions,
  bulkSetCategoryConfirmed,
  bulkUpdateTransactionCategory,
  deleteTransaction,
  setTransactionCategoryConfirmed,
  updateTransactionCategory,
} from "@/lib/actions/transactions";
import { parseCategoryDisplayName } from "@/lib/categories/display-name";
import { parseAccountCurrency } from "@/lib/currency/account-currency";
import type { SupportedCurrency } from "@/lib/currency/supported";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { Account, Category } from "@/types";

type Row = {
  id: number;
  date: string;
  description: string;
  amount: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryType: string | null;
  accountId: number;
  accountName: string | null;
  accountColor: string | null;
  accountCurrency: string | null;
  categorySource: string | null;
  categoryConfirmed: boolean;
  notes: string | null;
  linkedTransactionId: number | null;
  /** Same transaction amount converted to home currency (transaction date rate). */
  amountInHome: number;
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
  homeCurrency,
}: {
  rows: Row[];
  accounts: Account[];
  categories: Category[];
  /** Main groups for optgroup labels (optional, falls back to flat list). */
  categoryMains?: Category[];
  currentFilters: Record<string, string | undefined>;
  homeCurrency: SupportedCurrency;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState(currentFilters.search ?? "");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [createRuleForDescription, setCreateRuleForDescription] = useState<string | null>(null);

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
    col.display({
      id: "select",
      header: ({ table }) => (
        <SelectAllCheckbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.toggleAllRowsSelected}
        />
      ),
      cell: ({ row }) => (
        <RowCheckbox
          checked={row.getIsSelected()}
          onChange={() => row.toggleSelected()}
        />
      ),
    }),
    col.accessor("date", {
      header: ({ column }) => (
        <button
          type="button"
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
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.amountInHome;
        const b = rowB.original.amountInHome;
        return a - b;
      },
      header: ({ column }) => (
        <button
          type="button"
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
        const row = info.row.original;
        const isTransfer = row.categoryType === "transfer";
        const originalCurrency = parseAccountCurrency(
          row.originalCurrency ?? row.accountCurrency,
          homeCurrency,
        );
        const homeSigned = row.amountInHome;
        const originalSigned = row.originalAmount ?? row.amount;
        const showSecondaryAccountLine = originalCurrency !== homeCurrency;
        return (
          <div className="flex items-start justify-end gap-1">
            <div className="flex flex-col items-end">
              <span
                className={`text-sm font-medium whitespace-nowrap ${
                  homeSigned < 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {homeSigned < 0 ? "-" : "+"}
                {formatCurrency(Math.abs(homeSigned), homeCurrency)}
              </span>
              {showSecondaryAccountLine && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {originalSigned < 0 ? "-" : "+"}
                  {formatCurrency(Math.abs(originalSigned), originalCurrency)}
                </span>
              )}
            </div>
            {isTransfer && (
              <LinkTransferPopover
                transactionId={row.id}
                linkedTransactionId={row.linkedTransactionId}
              />
            )}
          </div>
        );
      },
    }),
    col.display({
      id: "actions",
      cell: (info) => (
        <RowActionsCell
          transactionId={info.row.original.id}
          description={info.row.original.description}
          onCreateRule={(desc) => setCreateRuleForDescription(desc)}
        />
      ),
    }),
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    enableMultiRowSelection: true,
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
          <SelectTrigger
            className="h-8 text-sm w-full sm:w-40"
            data-testid="filter-account"
          >
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

      {/* Bulk action bar */}
      {table.getSelectedRowModel().rows.length > 0 && (
        <BulkActionBar
          selectedIds={table.getSelectedRowModel().rows.map((r) => r.original.id)}
          selectedDescriptions={table.getSelectedRowModel().rows.map((r) => r.original.description)}
          selectedHaveCategory={table.getSelectedRowModel().rows.every((r) => r.original.categoryId !== null)}
          categories={categories}
          categoryMains={categoryMains}
          onClearSelection={() => table.resetRowSelection()}
          onCreateRule={(desc) => setCreateRuleForDescription(desc)}
        />
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table wrapperClassName="max-h-[calc(100vh-16rem)]">
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-label={
                      header.column.id === "confirm" ? "Verified" : undefined
                    }
                    className={cn(
                      "h-9 text-xs",
                      header.column.id === "select" && "w-10 min-w-10 px-2",
                      header.column.id === "accountName" &&
                        "hidden sm:table-cell",
                      header.column.id === "confirm" &&
                        "w-12 min-w-12 px-1 text-center hidden sm:table-cell",
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
                <TableRow
                  key={row.id}
                  className={cn(
                    "min-h-10",
                    row.getIsSelected() && "bg-primary/5",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-2",
                        cell.column.id === "select" && "w-10 min-w-10 px-2",
                        cell.column.id === "accountName" &&
                          "hidden sm:table-cell",
                        cell.column.id === "description" && "align-top",
                        cell.column.id === "confirm" &&
                          "w-12 min-w-12 px-1 text-center hidden sm:table-cell",
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
        {table.getSelectedRowModel().rows.length > 0 && (
          <span className="ml-2 text-primary font-medium">
            · {table.getSelectedRowModel().rows.length} selected
          </span>
        )}
      </p>

      <CreateRuleDialog
        open={createRuleForDescription !== null}
        onClose={() => setCreateRuleForDescription(null)}
        description={createRuleForDescription ?? ""}
        categories={categories}
        categoryMains={categoryMains}
      />
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
            "max-w-[8rem] sm:max-w-[14rem] text-xs font-medium py-0.5 px-2 h-auto min-h-6 leading-tight",
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

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      data-testid="select-all-rows"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
      aria-label="Select all rows"
    />
  );
}

function RowCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      data-testid="select-row"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
      aria-label="Select row"
    />
  );
}

function RowActionsCell({
  transactionId,
  description,
  onCreateRule,
}: {
  transactionId: number;
  description: string;
  onCreateRule: (desc: string) => void;
}) {
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
    <div className="group flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Create rule from transaction"
        data-testid="create-rule-from-transaction"
        onClick={() => onCreateRule(description)}
        className="p-1 rounded text-muted-foreground/0 group-hover:text-primary/40 hover:!text-primary hover:bg-primary/10 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Delete"
        data-testid="delete-transaction"
        onClick={() => setConfirming(true)}
        className="p-1 rounded text-muted-foreground/0 group-hover:text-muted-foreground/30 hover:!text-destructive hover:bg-destructive/10 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BulkActionBar({
  selectedIds,
  selectedDescriptions,
  selectedHaveCategory,
  categories,
  categoryMains,
  onClearSelection,
  onCreateRule,
}: {
  selectedIds: number[];
  selectedDescriptions: string[];
  selectedHaveCategory: boolean;
  categories: Category[];
  categoryMains?: Category[];
  onClearSelection: () => void;
  onCreateRule: (desc: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const mains = categoryMains ?? categories.filter((c) => c.parentId === null);

  function runAndRefresh(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
      onClearSelection();
    });
  }

  return (
    <div
      data-testid="bulk-action-bar"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm",
        isPending && "opacity-60 pointer-events-none",
      )}
    >
      {/* Selection count + clear */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-semibold tabular-nums text-amber-800 dark:text-amber-300">
          {selectedIds.length}
        </span>
        <span className="text-amber-700/80 dark:text-amber-400/80">selected</span>
        <button
          type="button"
          data-testid="bulk-clear-selection"
          aria-label="Clear selection"
          onClick={onClearSelection}
          className="ml-0.5 p-0.5 rounded-full text-amber-700/50 hover:text-amber-900 hover:bg-amber-500/15 dark:text-amber-400/50 dark:hover:text-amber-300 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="h-4 w-px bg-amber-500/20 shrink-0" />

      {/* Apply category */}
      <Select
        onValueChange={(v) =>
          runAndRefresh(() => bulkUpdateTransactionCategory(selectedIds, Number(v)))
        }
        disabled={isPending}
      >
        <SelectTrigger className="h-7 text-xs w-40 border-amber-500/20 bg-background/80">
          <SelectValue placeholder="Apply category…" />
        </SelectTrigger>
        <SelectContent>
          <CategorySelectGrouped
            categories={categories.filter((c) => c.parentId !== null)}
            mains={mains}
          />
        </SelectContent>
      </Select>

      <div className="h-4 w-px bg-border/60 shrink-0 hidden sm:block" />

      {/* Confirm / unconfirm */}
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-40"
        disabled={isPending || !selectedHaveCategory}
        title={!selectedHaveCategory ? "All selected rows need a category first" : undefined}
        onClick={() =>
          runAndRefresh(() => bulkSetCategoryConfirmed(selectedIds, true))
        }
      >
        Confirm
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-xs text-muted-foreground"
        disabled={isPending}
        onClick={() =>
          runAndRefresh(() => bulkSetCategoryConfirmed(selectedIds, false))
        }
      >
        Unconfirm
      </Button>

      {/* Create rule */}
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={isPending}
        onClick={() =>
          onCreateRule(selectedIds.length === 1 ? (selectedDescriptions[0] ?? "") : "")
        }
      >
        <Sparkles className="h-3 w-3 mr-1" />
        Create rule
      </Button>

      {/* Destructive zone — pushed to the right on wider screens */}
      <div className="sm:ml-auto flex items-center gap-1">
        {deleteConfirming ? (
          <>
            <span className="text-xs text-destructive font-medium">
              Delete {selectedIds.length}?
            </span>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2 text-xs"
              disabled={isPending}
              onClick={() => {
                setDeleteConfirming(false);
                runAndRefresh(() => bulkDeleteTransactions(selectedIds));
              }}
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={isPending}
              onClick={() => setDeleteConfirming(false)}
            >
              No
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive/60 hover:text-destructive hover:bg-destructive/10"
            disabled={isPending}
            onClick={() => setDeleteConfirming(true)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
