import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState, type ColumnFiltersState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({ columns, data, pageSize = 20, onRowClick }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data, columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="rounded-2xl border border-purple-50 bg-white shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent border-b border-purple-50 bg-violet-50/50">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-[11px] font-bold uppercase tracking-wider text-gray-400 py-3.5">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`border-b border-purple-50/50 transition-all duration-200 table-row-hover hover:translate-x-0.5 animate-slide-up ${idx % 2 === 1 ? "bg-gray-50/30" : ""} ${onRowClick ? "cursor-pointer hover:bg-violet-50/40" : ""}`}
                  style={{ animationDelay: `${Math.min(idx, 14) * 35}ms` }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-28 text-center">
                  <p className="text-sm text-gray-400">No results found</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-1 animate-fade-in">
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-gray-700">{table.getFilteredRowModel().rows.length}</span> results · Page{" "}
            <span className="font-semibold text-gray-700">{table.getState().pagination.pageIndex + 1}</span> of{" "}
            <span className="font-semibold text-gray-700">{table.getPageCount()}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: Math.min(5, table.getPageCount()) }, (_, i) => {
              const pageIdx = Math.max(0, Math.min(table.getState().pagination.pageIndex - 2, table.getPageCount() - 5)) + i;
              if (pageIdx >= table.getPageCount()) return null;
              const isActive = pageIdx === table.getState().pagination.pageIndex;
              return (
                <button
                  key={pageIdx}
                  onClick={() => table.setPageIndex(pageIdx)}
                  className={`h-8 min-w-[32px] px-2 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 ${
                    isActive ? "text-white shadow-sm scale-105" : "text-gray-500 hover:bg-violet-50 hover:text-violet-700"
                  }`}
                  style={isActive ? { background: "var(--color-primary,#7C3AED)", boxShadow: "0 4px 12px var(--color-primary,#7C3AED)50" } : undefined}
                >
                  {pageIdx + 1}
                </button>
              );
            })}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
