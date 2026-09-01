import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { FileText, Eye, XCircle } from "lucide-react";
import {
  listAdmissionApplications, rejectAdmissionApplication, type AdmissionApplication,
} from "@/api/admissionApplications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAction } from "@/components/ui/icon-action";
import { TruncatedText } from "@/components/ui/truncated-text";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";

const STATUS_COLORS: Record<string, "default" | "info" | "success" | "danger"> = {
  pending:  "info",
  admitted: "success",
  rejected: "danger",
};

const STATUSES = ["pending", "rejected", "admitted"] as const;

function RejectDialog({ application, open, onClose }: { application: AdmissionApplication; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => rejectAdmissionApplication(application.id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admission-applications"] });
      toast({ title: "Application rejected" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Failed to reject application" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reject Application</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-medium">{application.fullName}</p>
            <p className="text-sm text-gray-500">{application.phone}</p>
          </div>
          <FormField label="Reason" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate submission, spam, unreachable"
            />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdmissionApplicationsPage() {
  const navigate = useNavigate();
  // Supports deep-linking from the dashboard's "Pending Applications" alert
  // and recent-admissions rows (/admission-applications?status=...) — read
  // once on mount, not kept in sync with the URL afterwards (the tab buttons
  // below are the source of truth from then on).
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? "pending");
  const [rejecting, setRejecting] = useState<AdmissionApplication | null>(null);

  const { data: applications, isLoading } = useQuery({
    queryKey: ["admission-applications", statusFilter],
    queryFn:  () => listAdmissionApplications(statusFilter),
  });

  const columns: ColumnDef<AdmissionApplication>[] = [
    {
      accessorKey: "fullName",
      header: "Name",
      cell: ({ row }) => <TruncatedText text={row.original.fullName} className="max-w-[160px]" />,
    },
    { accessorKey: "phone", header: "Phone" },
    {
      id: "course",
      header: "Course",
      cell: ({ row }) => <TruncatedText text={row.original.course?.name} className="max-w-[140px]" />,
    },
    {
      id: "center",
      header: "Preferred Center",
      cell: ({ row }) => <TruncatedText text={row.original.center?.name} className="max-w-[140px]" />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.original.status] ?? "default"} className="capitalize">
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Applied",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const app = row.original;
        if (app.status !== "pending") return null;
        return (
          <div className="flex gap-2">
            <IconAction label="Review" icon={<Eye className="h-3.5 w-3.5" />} variant="default" onClick={() => navigate(`/students?applicationId=${app.id}`)} />
            <IconAction
              label="Reject" icon={<XCircle className="h-3.5 w-3.5" />} className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setRejecting(app)}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Admission Applications</h1>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (applications ?? []).length === 0 ? (
          <EmptyState icon={FileText} title="No applications found" />
        ) : (
          <DataTable columns={columns} data={applications ?? []} />
        )}
      </div>

      {rejecting && (
        <RejectDialog application={rejecting} open={!!rejecting} onClose={() => setRejecting(null)} />
      )}
    </div>
  );
}
