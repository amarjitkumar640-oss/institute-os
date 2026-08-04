import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Search, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listLeads, createLead, convertLead, type Lead } from "@/api/leads";
import { listExamCategories } from "@/api/subjects";
import { listBatches } from "@/api/batches";
import { listAssignableCenters } from "@/api/centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const STATUS_COLORS: Record<string, "default" | "info" | "warning" | "success" | "danger"> = {
  new: "info",
  contacted: "warning",
  visited: "purple" as never,
  converted: "success",
  lost: "danger",
};

const createLeadFormSchema = z.object({
  name: z.string().min(1, "Required"),
  phone: z.string().min(1, "Required"),
  targetExamId: z.string().uuid("Required"),
  source: z.string().min(1, "Required"),
  notes: z.string().optional(),
  centerId: z.string().uuid().optional(),
});
type CreateLeadForm = z.infer<typeof createLeadFormSchema>;

function CreateLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentCenter } = useAuth();
  const qc = useQueryClient();
  const { data: examCategories } = useQuery({ queryKey: ["exam-categories"], queryFn: listExamCategories });
  const { data: centers } = useQuery({ queryKey: ["centers-assignable"], queryFn: listAssignableCenters, enabled: !currentCenter });

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<CreateLeadForm>({
    resolver: zodResolver(createLeadFormSchema),
  });

  const mutation = useMutation({
    mutationFn: createLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead added" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Failed to create lead" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Lead</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <FormField label="Name" error={errors.name} required>
            <Input {...register("name")} placeholder="Full name" />
          </FormField>
          <FormField label="Phone" error={errors.phone} required>
            <Input {...register("phone")} placeholder="Phone number" />
          </FormField>
          <FormField label="Target Exam" error={errors.targetExamId} required>
            <Select onValueChange={(v) => setValue("targetExamId", v)}>
              <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
              <SelectContent>
                {(examCategories ?? []).map((ec) => (
                  <SelectItem key={ec.id} value={ec.id}>{ec.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Source" error={errors.source} required>
            <Input {...register("source")} placeholder="e.g. Walk-in, Referral, Social Media" />
          </FormField>
          <FormField label="Notes" error={errors.notes}>
            <Input {...register("notes")} placeholder="Optional notes" />
          </FormField>
          {!currentCenter && (
            <FormField label="Center" error={errors.centerId} required>
              <Select onValueChange={(v) => setValue("centerId", v)}>
                <SelectTrigger><SelectValue placeholder="Select center" /></SelectTrigger>
                <SelectContent>
                  {(centers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Add Lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConvertLeadDialog({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: batches } = useQuery({ queryKey: ["batches"], queryFn: listBatches });

  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    if (!batchId) return;
    setLoading(true);
    try {
      await convertLead(lead.id, { batchId });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead converted to student" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Conversion failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Convert Lead to Student</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-medium">{lead.name}</p>
            <p className="text-sm text-gray-500">{lead.phone}</p>
          </div>
          <FormField label="Assign to Batch" required>
            <Select onValueChange={setBatchId}>
              <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
              <SelectContent>
                {(batches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConvert} disabled={!batchId || loading}>Convert to Student</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUSES = ["new", "contacted", "visited", "converted", "lost"] as const;

export function LeadsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);

  const { data: leads, isLoading } = useQuery({ queryKey: ["leads"], queryFn: listLeads });

  const filtered = (leads ?? []).filter((l) => {
    const matchSearch = l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search);
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns: ColumnDef<Lead>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "phone", header: "Phone" },
    {
      id: "exam",
      header: "Target Exam",
      cell: ({ row }) => <Badge variant="info">{row.original.targetExam.label}</Badge>,
    },
    { accessorKey: "source", header: "Source" },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.original.status] ?? "default"}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Added",
      cell: ({ row }) => <span className="text-sm text-gray-500">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => row.original.status !== "converted" ? (
        <Button size="sm" variant="outline" onClick={() => setConvertingLead(row.original)}>
          Convert
        </Button>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Leads</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Lead
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              All
            </Button>
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
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No leads found"
            actionLabel="Add Lead"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <DataTable columns={columns} data={filtered} />
        )}
      </div>

      <CreateLeadDialog open={showCreate} onClose={() => setShowCreate(false)} />
      {convertingLead && (
        <ConvertLeadDialog
          lead={convertingLead}
          open={!!convertingLead}
          onClose={() => setConvertingLead(null)}
        />
      )}
    </div>
  );
}
