import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Landmark } from "lucide-react";
import {
  listOrganizations, createOrganization, updateOrganization, deleteOrganization,
  type GovOrganization, type GovOrgType,
} from "@/api/govExams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

const ORG_TYPE_LABEL: Record<GovOrgType, string> = { ssc: "SSC", banking: "Banking", railway: "Railway", other: "Other" };

const orgSchema = z.object({
  name: z.string().min(1, "Required").max(200),
  shortName: z.string().min(1, "Required").max(50),
  type: z.enum(["ssc", "banking", "railway", "other"]),
  logoUrl: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
  officialWebsite: z.string().url("Must be a valid URL").or(z.literal("")).optional(),
});
type OrgFormValues = z.infer<typeof orgSchema>;

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function OrganizationFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: GovOrganization }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: existing
      ? { name: existing.name, shortName: existing.shortName, type: existing.type, logoUrl: existing.logoUrl ?? "", officialWebsite: existing.officialWebsite ?? "" }
      : { name: "", shortName: "", type: "ssc", logoUrl: "", officialWebsite: "" },
  });
  const type = watch("type");

  const mutation = useMutation({
    mutationFn: (values: OrgFormValues) => {
      const input = { ...values, logoUrl: values.logoUrl || undefined, officialWebsite: values.officialWebsite || undefined };
      return existing ? updateOrganization(existing.id, input) : createOrganization(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-organizations"] });
      toast({ title: existing ? "Updated" : "Added" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Organization</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <FormField label="Name" required error={errors.name}>
            <Input {...register("name")} placeholder="e.g. Staff Selection Commission" />
          </FormField>
          <FormField label="Short Name" required error={errors.shortName}>
            <Input {...register("shortName")} placeholder="e.g. SSC" />
          </FormField>
          <FormField label="Type" required>
            <Select value={type} onValueChange={(v) => setValue("type", v as GovOrgType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ORG_TYPE_LABEL) as GovOrgType[]).map((t) => (
                  <SelectItem key={t} value={t}>{ORG_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Official Website" error={errors.officialWebsite}>
            <Input {...register("officialWebsite")} placeholder="https://ssc.nic.in" />
          </FormField>
          <FormField label="Logo URL" error={errors.logoUrl}>
            <Input {...register("logoUrl")} placeholder="https://..." />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationsTab() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<GovOrganization | null>(null);

  const { data: organizations, isLoading } = useQuery({ queryKey: ["gov-organizations"], queryFn: listOrganizations });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganization,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gov-organizations"] });
      toast({ title: "Deleted" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Add Organization</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !organizations?.length ? (
        <EmptyState icon={Landmark} title="No organizations yet" description="Add SSC, IBPS, RRB, etc. before creating recruitments." actionLabel="Add Organization" onAction={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-2">
          {organizations.map((org) => (
            <div key={org.id} className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{org.name}</p>
                  <Badge variant="purple">{org.shortName}</Badge>
                  <Badge variant="outline">{ORG_TYPE_LABEL[org.type]}</Badge>
                </div>
                {org.officialWebsite && <p className="text-xs text-gray-400 truncate">{org.officialWebsite}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditing(org)}>Edit</Button>
                <Button
                  size="sm" variant="ghost" className="text-red-600"
                  onClick={() => { if (confirm(`Delete ${org.name}? This is blocked if it has any recruitments.`)) deleteMutation.mutate(org.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <OrganizationFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <OrganizationFormDialog open={!!editing} onClose={() => setEditing(null)} existing={editing} />}
    </div>
  );
}
