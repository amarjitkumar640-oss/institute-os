import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, DollarSign } from "lucide-react";
import { listFeeSchedules, getFeeSummary, type ScheduleListItem } from "@/api/fees";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { CollectionTab } from "./CollectionTab";

const STATUS_COLORS: Record<string, "default" | "success" | "danger" | "warning"> = {
  active: "info" as never,
  completed: "success",
  overdue: "danger",
  partial: "warning",
};

export function FeesPage() {
  const navigate = useNavigate();
  const { isAllCenters } = useAuth();
  const [search, setSearch] = useState("");
  // Supports deep-linking from the dashboard's "Overdue Fees" alert
  // (/fees?status=overdue) — read once on mount, not kept in sync with the
  // URL afterwards (the Select below is the source of truth from then on).
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(searchParams.get("status") ?? undefined);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["fee-schedules", search, statusFilter],
    queryFn: () => listFeeSchedules({ search: search || undefined, status: statusFilter }),
  });

  const { data: summary } = useQuery({ queryKey: ["fee-summary"], queryFn: getFeeSummary });

  // Only meaningful when viewing more than one center's data at once —
  // redundant (every row would show the same name) when scoped to one.
  const centerColumn: ColumnDef<ScheduleListItem> = {
    id: "center",
    header: "Center",
    cell: ({ row }) => row.original.batch?.center?.name ?? "—",
  };

  const columns: ColumnDef<ScheduleListItem>[] = [
    {
      id: "student",
      header: "Student",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.student?.fullName ?? "—"}</p>
          <p className="text-xs text-gray-500">{row.original.student?.phone ?? ""}</p>
        </div>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      cell: ({ row }) => <span className="text-sm">{row.original.batch?.name ?? "—"}</span>,
    },
    ...(isAllCenters ? [centerColumn] : []),
    {
      accessorKey: "totalFee",
      header: "Total Fee",
      cell: ({ row }) => formatCurrency(row.original.totalFee),
    },
    {
      accessorKey: "effectiveFee",
      header: "Effective Fee",
      cell: ({ row }) => formatCurrency(row.original.effectiveFee),
    },
    {
      id: "paid",
      header: "Paid",
      cell: ({ row }) => formatCurrency(row.original.paidAmount),
    },
    {
      id: "pending",
      header: "Pending",
      cell: ({ row }) => <span className={row.original.pendingAmount > 0 ? "text-red-600 font-medium" : ""}>{formatCurrency(row.original.pendingAmount)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.original.status] ?? "default"}>{row.original.status}</Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => navigate(`/fees/${row.original.enrollmentId}`)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fees</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track collections, pending dues and fee schedules</p>
        </div>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <Tabs defaultValue="schedules">
          <TabsList>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            <TabsTrigger value="collection">Collection</TabsTrigger>
          </TabsList>
          <TabsContent value="schedules" className="space-y-5">
        {summary && (
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: "Total Collected",
                value: formatCurrency(summary.totalCollected),
                gradient: "from-emerald-500 to-emerald-700",
                icon: "💰",
              },
              {
                label: "Total Pending",
                value: formatCurrency(summary.totalPending),
                gradient: "from-amber-500 to-orange-600",
                icon: "⏳",
              },
              {
                label: "Overdue Count",
                value: summary.overdueCount,
                gradient: "from-red-500 to-rose-700",
                icon: "🚨",
              },
            ].map(({ label, value, gradient, icon }) => (
              <div
                key={label}
                className={`rounded-2xl p-5 bg-gradient-to-br ${gradient} text-white`}
                style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{label}</p>
                  <span className="text-lg">{icon}</span>
                </div>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search by student name..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select onValueChange={(v) => setStatusFilter(v === "_all" ? undefined : v)} value={statusFilter ?? "_all"}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (schedules ?? []).length === 0 ? (
          <EmptyState icon={DollarSign} title="No fee records found" />
        ) : (
          <DataTable columns={columns} data={schedules ?? []} />
        )}
          </TabsContent>

          <TabsContent value="collection">
            <CollectionTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
