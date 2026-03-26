"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { updateTransactionCategory } from "@/lib/actions/transactions";
import { LinkTransferPopover } from "@/components/transactions/link-transfer-popover";
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
    [currentFilters, pathname, router]
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
        <div className="max-w-xs">
          <p className="text-sm truncate">{info.getValue()}</p>
          {info.row.original.notes && (
            <p className="text-xs text-muted-foreground truncate">
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
            categories={categories}
          />
        );
      },
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
              {amount < 0 ? "-" : "+"}{formatCurrency(amount)}
            </span>
          </div>
        );
      },
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
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search transactions…"
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            updateFilter("search", e.target.value || undefined);
          }}
          className="max-w-xs h-8 text-sm"
        />

        <Select
          value={currentFilters.accountId ?? "all"}
          onValueChange={(v) => updateFilter("accountId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="h-8 text-sm w-40">
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
          onValueChange={(v) => updateFilter("categoryId", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="h-8 text-sm w-44">
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
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="h-9 text-xs">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground text-sm">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="h-10">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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

function CategoryCell({
  transactionId,
  categoryId,
  categoryName,
  categoryColor,
  categories,
}: {
  transactionId: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
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
          const newCategoryId = v === "none" ? null : parseInt(v);
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
          className="text-xs font-normal"
          style={{ backgroundColor: `${categoryColor}20`, color: categoryColor ?? undefined }}
        >
          {categoryName}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground italic">Uncategorised</span>
      )}
    </button>
  );
}
