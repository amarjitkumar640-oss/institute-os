import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  getCollectionSummary, getCollectionByBatch,
  type CollectionPeriod, type BatchCollectionRow,
} from "@/api/fees";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { Layers } from "lucide-react";

const PERIOD_LABEL: Record<CollectionPeriod, string> = {
  today: "Today", week: "This Week", month: "This Month", year: "This Year",
};

export function CollectionTab() {
  const [period, setPeriod] = useState<CollectionPeriod>("month");

  const { data: summary } = useQuery({ queryKey: ["fee-collection-summary"], queryFn: getCollectionSummary });
  const { data: byBatch, isLoading } = useQuery({
    queryKey: ["fee-collection-by-batch", period],
    queryFn: () => getCollectionByBatch(period),
  });

  const columns: ColumnDef<BatchCollectionRow>[] = [
    { accessorKey: "batchName", header: "Batch" },
    {
      id: "collected",
      header: `Collected (${PERIOD_LABEL[period]})`,
      cell: ({ row }) => <span className="text-emerald-700 font-medium">{formatCurrency(row.original.collectedAmount)}</span>,
    },
    {
      id: "pending",
      header: "Pending (current)",
      cell: ({ row }) => (
        <span className={row.original.pendingAmount > 0 ? "text-red-600 font-medium" : ""}>
          {formatCurrency(row.original.pendingAmount)}
        </span>
      ),
    },
    {
      id: "pendingStudentCount",
      header: "Students Pending",
      cell: ({ row }) => row.original.pendingStudentCount,
    },
  ];

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Today's Collection", value: summary.collectedToday, gradient: "from-emerald-500 to-emerald-700", icon: "📅" },
            { label: "This Week", value: summary.collectedThisWeek, gradient: "from-teal-500 to-teal-700", icon: "🗓️" },
            { label: "This Month", value: summary.collectedThisMonth, gradient: "from-sky-500 to-sky-700", icon: "📆" },
            { label: "This Year", value: summary.collectedThisYear, gradient: "from-indigo-500 to-indigo-700", icon: "📈" },
          ].map(({ label, value, gradient, icon }) => (
            <div key={label} className={`rounded-2xl p-5 bg-gradient-to-br ${gradient} text-white`} style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{label}</p>
                <span className="text-lg">{icon}</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Collection by Batch</h2>
        <Select onValueChange={(v) => setPeriod(v as CollectionPeriod)} value={period}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (byBatch?.batches ?? []).length === 0 ? (
        <EmptyState icon={Layers} title="No batches found" />
      ) : (
        <DataTable columns={columns} data={byBatch!.batches} />
      )}
    </div>
  );
}
