import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Landmark, ArrowRight } from "lucide-react";
import { listSponsors, createSponsor, updateSponsor, type Sponsor, type CreateSponsorPayload } from "@/api/sponsors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { usePermission } from "@/hooks/usePermission";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function SponsorFormDialog({
  open, onClose, existing,
}: { open: boolean; onClose: () => void; existing?: Sponsor }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateSponsorPayload>({
    name: existing?.name ?? "",
    contactPerson: existing?.contactPerson ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    address: existing?.address ?? "",
    gstin: existing?.gstin ?? "",
    stateCode: existing?.stateCode ?? "",
    notes: existing?.notes ?? "",
  });
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => {
      const payload: CreateSponsorPayload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
        email: form.email?.trim() || undefined,
        address: form.address?.trim() || undefined,
        gstin: form.gstin?.trim() || undefined,
        stateCode: form.stateCode?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      };
      return existing ? updateSponsor(existing.id, payload) : createSponsor(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sponsors"] });
      toast({ title: existing ? "Sponsor updated" : "Sponsor added" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleSubmit() {
    if (!form.name.trim()) { setError("Sponsor name is required."); return; }
    setError(undefined);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit Sponsor" : "Add Sponsor"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <FormField label="Company Name" error={error ? { message: error } as never : undefined} required>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Acme Corp Pvt. Ltd." />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contact Person">
              <Input value={form.contactPerson} onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))} />
            </FormField>
            <FormField label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          </FormField>
          <FormField label="Address">
            <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="GSTIN">
              <Input value={form.gstin} onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value }))} className="font-mono text-sm" maxLength={20} />
            </FormField>
            <FormField label="GST State Code">
              <Input value={form.stateCode} onChange={(e) => setForm((p) => ({ ...p, stateCode: e.target.value }))} placeholder="e.g. 27" className="font-mono text-sm" maxLength={2} />
            </FormField>
          </div>
          <FormField label="Notes">
            <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>{existing ? "Save" : "Add Sponsor"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SponsorsPage() {
  const navigate = useNavigate();
  const { canWrite, canEdit } = usePermission("sponsors");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Sponsor | undefined>();

  const { data: sponsors, isLoading } = useQuery({ queryKey: ["sponsors"], queryFn: listSponsors });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CSR Sponsors</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Companies sponsoring a batch's course fee in full — track their contract, payment milestones, and invoices.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Sponsor
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !sponsors?.length ? (
        <EmptyState icon={Landmark} title="No sponsors yet" actionLabel={canWrite ? "Add Sponsor" : undefined} onAction={canWrite ? () => setShowCreate(true) : undefined} />
      ) : (
        <div className="space-y-2">
          {sponsors.map((sponsor) => (
            <button
              key={sponsor.id}
              onClick={() => navigate(`/sponsors/${sponsor.id}`)}
              className="w-full flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3.5 text-left hover:border-gray-300 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <Landmark className="h-5 w-5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{sponsor.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {sponsor.contactPerson || sponsor.phone || sponsor.email || "No contact details"}
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm" variant="ghost"
                  onClick={(e) => { e.stopPropagation(); setEditing(sponsor); }}
                >
                  Edit
                </Button>
              )}
              <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {showCreate && <SponsorFormDialog open={showCreate} onClose={() => setShowCreate(false)} />}
      {editing && <SponsorFormDialog open={!!editing} onClose={() => setEditing(undefined)} existing={editing} />}
    </div>
  );
}
