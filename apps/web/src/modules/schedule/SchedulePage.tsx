import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Calendar, RefreshCw } from "lucide-react";
import { listBatches } from "@/api/batches";
import { listBatchSessions, patchSession, generateSessions, type ClassSession } from "@/api/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export function SchedulePage() {
  const qc = useQueryClient();
  const { staff } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(oneMonthLater);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [generatingRange, setGeneratingRange] = useState({ from: today, to: oneMonthLater });

  const { data: batches } = useQuery({ queryKey: ["batches"], queryFn: listBatches });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions", batchId, from, to, statusFilter],
    queryFn: () => listBatchSessions(batchId!, { from, to, status: statusFilter || undefined }),
    enabled: !!batchId,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { status: "completed" | "cancelled"; cancelReason?: string } }) =>
      patchSession(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: "Session updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateSessions(batchId!, generatingRange),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast({ title: "Sessions generated" });
    },
    onError: () => toast({ variant: "destructive", title: "Generation failed" }),
  });

  const columns: ColumnDef<ClassSession>[] = [
    {
      accessorKey: "scheduledDate",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.scheduledDate),
    },
    {
      id: "time",
      header: "Time",
      cell: ({ row }) => `${row.original.startTime} – ${row.original.endTime}`,
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <Badge variant="default">{row.original.type}</Badge>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.status === "completed" ? "success" : row.original.status === "cancelled" ? "danger" : "info"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      cell: ({ row }) => row.original.subject?.name ?? "—",
    },
    {
      id: "faculty",
      header: "Faculty",
      cell: ({ row }) => row.original.faculty?.fullName ?? "—",
    },
    {
      id: "room",
      header: "Room",
      cell: ({ row }) => row.original.room ?? "—",
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => row.original.status === "scheduled" && (staff?.role === "admin" || staff?.role === "teacher") ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => patchMutation.mutate({ id: row.original.id, payload: { status: "completed" } })}>
            Complete
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => patchMutation.mutate({ id: row.original.id, payload: { status: "cancelled" } })}>
            Cancel
          </Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-400 mt-0.5">View and manage class sessions across batches</p>
        </div>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Select onValueChange={(v) => setBatchId(v)} value={batchId ?? ""}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a batch..." />
            </SelectTrigger>
            <SelectContent>
              {(batches ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {batchId && (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
              <span className="text-gray-400">–</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />

              <Select onValueChange={(v) => setStatusFilter(v === "_all" ? undefined : v)} value={statusFilter ?? "_all"}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {batchId && staff?.role === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Generate Sessions from Slots</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Input type="date" value={generatingRange.from} onChange={(e) => setGeneratingRange((p) => ({ ...p, from: e.target.value }))} className="w-36" />
              <span className="text-gray-400">–</span>
              <Input type="date" value={generatingRange.to} onChange={(e) => setGeneratingRange((p) => ({ ...p, to: e.target.value }))} className="w-36" />
              <Button variant="outline" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                Generate
              </Button>
            </CardContent>
          </Card>
        )}

        {!batchId ? (
          <EmptyState icon={Calendar} title="Select a batch to view schedule" />
        ) : isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (sessions ?? []).length === 0 ? (
          <EmptyState icon={Calendar} title="No sessions found for this range" description="Generate sessions from batch slots or add ad-hoc sessions" />
        ) : (
          <DataTable columns={columns} data={sessions ?? []} />
        )}
      </div>
    </div>
  );
}
