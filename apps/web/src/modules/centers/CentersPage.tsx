import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Building2, Settings } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { listAllCenters, createCenter, type Center } from "@/api/centers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAction } from "@/components/ui/icon-action";
import { TruncatedText } from "@/components/ui/truncated-text";
import { toast } from "@/components/ui/use-toast";

const createCenterSchema = z.object({
  name: z.string().min(1, "Required"),
  address: z.string().optional(),
  phone: z.string().optional(),
});
type CreateCenterForm = z.infer<typeof createCenterSchema>;

function CreateCenterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateCenterForm>({
    resolver: zodResolver(createCenterSchema),
  });

  const mutation = useMutation({
    mutationFn: createCenter,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["centers-all"] });
      toast({ title: "Center created" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Failed to create center" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Center</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <FormField label="Center Name" error={errors.name} required>
            <Input {...register("name")} placeholder="e.g. Main Branch" />
          </FormField>
          <FormField label="Address" error={errors.address}>
            <Input {...register("address")} placeholder="Full address" />
          </FormField>
          <FormField label="Phone" error={errors.phone}>
            <Input {...register("phone")} placeholder="Contact number" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CentersPage() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const { data: centers, isLoading } = useQuery({ queryKey: ["centers-all"], queryFn: listAllCenters });

  const columns: ColumnDef<Center>[] = [
    {
      accessorKey: "name",
      header: "Center Name",
      cell: ({ row }) => (
        <button
          className="block max-w-[160px] text-left font-medium text-gray-900 hover:text-[var(--color-primary,#C0392B)]"
          onClick={() => navigate(`/centers/${row.original.id}`)}
        >
          <TruncatedText text={row.original.name} />
        </button>
      ),
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => <TruncatedText text={row.original.address} className="max-w-[220px]" />,
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => row.original.phone ?? "—",
    },
    {
      id: "counts",
      header: "Students / Batches / Staff",
      cell: ({ row }) => row.original.counts
        ? `${row.original.counts.students} / ${row.original.counts.batches} / ${row.original.counts.staff}`
        : "—",
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "default"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <IconAction label="Manage" icon={<Settings className="h-3.5 w-3.5" />} onClick={() => navigate(`/centers/${row.original.id}`)} />
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between bg-white px-7 py-5" style={{ borderBottom: "1px solid rgba(109,40,217,0.07)" }}>
        <h1 className="text-xl font-bold text-gray-900">Centers</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Center
        </Button>
      </div>
      <div className="flex-1 p-7 space-y-5">
        {isLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (centers ?? []).length === 0 ? (
          <EmptyState icon={Building2} title="No centers yet" actionLabel="Create Center" onAction={() => setShowCreate(true)} />
        ) : (
          <DataTable columns={columns} data={centers ?? []} />
        )}
      </div>
      {showCreate && <CreateCenterDialog open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
