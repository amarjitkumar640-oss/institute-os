import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark, Upload } from "lucide-react";
import { getContractForBatch, createContract, listSponsors, uploadContractDocument, type Sponsor } from "@/api/sponsors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";
import { MilestonesPanel } from "@/modules/sponsors/MilestonesPanel";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function LinkSponsorForm({ batchId, sponsors, invalidateKey }: { batchId: string; sponsors: Sponsor[]; invalidateKey: unknown[] }) {
  const qc = useQueryClient();
  const [sponsorId, setSponsorId] = useState<string | undefined>();
  const [contractedStudentCount, setContractedStudentCount] = useState("");
  const [totalContractAmount, setTotalContractAmount] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [gstExempt, setGstExempt] = useState(false);
  const [tdsRate, setTdsRate] = useState("8");
  const [tdsExempt, setTdsExempt] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => createContract({
      sponsorId: sponsorId!,
      batchId,
      contractedStudentCount: Number(contractedStudentCount),
      totalContractAmount: Number(totalContractAmount),
      gstRate: gstExempt ? null : Number(gstRate),
      tdsRate: tdsExempt ? null : Number(tdsRate),
      startDate,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      toast({ title: "Sponsor linked to this batch" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleSubmit() {
    if (!sponsorId) { setError("Select a sponsor."); return; }
    const count = Number(contractedStudentCount);
    if (!contractedStudentCount.trim() || !Number.isInteger(count) || count <= 0) { setError("Enter a valid student count."); return; }
    const amt = Number(totalContractAmount);
    if (!totalContractAmount.trim() || isNaN(amt) || amt <= 0) { setError("Enter a valid contract amount."); return; }
    setError(undefined);
    mutation.mutate();
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-gray-400">
        Link a company sponsoring this batch's course fee in full. Every student admitted into this batch is
        automatically billed nothing — no fee schedule is generated for them.
      </p>
      <FormField label="Sponsor" error={error && !sponsorId ? { message: error } as never : undefined} required>
        <Select value={sponsorId} onValueChange={setSponsorId}>
          <SelectTrigger><SelectValue placeholder="Select a sponsor" /></SelectTrigger>
          <SelectContent>
            {sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
      {!sponsors.length && (
        <p className="text-xs text-amber-600">No sponsors yet — add one from the Sponsors page first.</p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Contracted Students" required>
          <Input type="number" min={1} value={contractedStudentCount} onChange={(e) => setContractedStudentCount(e.target.value)} placeholder="e.g. 30" />
        </FormField>
        <FormField label="Total Contract Amount (₹)" required>
          <Input type="number" min={0} value={totalContractAmount} onChange={(e) => setTotalContractAmount(e.target.value)} placeholder="e.g. 300000" />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-4 items-end">
        <FormField label="GST Rate (%)">
          <Input type="number" min={0} max={100} value={gstRate} disabled={gstExempt} onChange={(e) => setGstRate(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
          <input type="checkbox" checked={gstExempt} onChange={(e) => setGstExempt(e.target.checked)} />
          GST exempt
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4 items-end">
        <FormField label="TDS Rate (%)">
          <Input type="number" min={0} max={100} value={tdsRate} disabled={tdsExempt} onChange={(e) => setTdsRate(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
          <input type="checkbox" checked={tdsExempt} onChange={(e) => setTdsExempt(e.target.checked)} />
          No TDS deducted
        </label>
      </div>
      <p className="text-xs text-gray-400 -mt-2">
        If the sponsor deducts TDS before paying, set the rate here — every invoice will show the deduction and the net amount you'll actually receive.
      </p>
      <FormField label="Start Date" required>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </FormField>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button onClick={handleSubmit} disabled={mutation.isPending || !sponsors.length}>Link Sponsor</Button>
    </div>
  );
}

export function SponsorshipTab({ batchId }: { batchId: string }) {
  const { canWrite, canEdit } = usePermission("sponsors");
  const invalidateKey = ["sponsorship-contract", batchId];

  const { data: contract, isLoading } = useQuery({
    queryKey: invalidateKey,
    queryFn: () => getContractForBatch(batchId),
  });
  const { data: sponsors } = useQuery({ queryKey: ["sponsors"], queryFn: listSponsors, enabled: !contract });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadContractDocument(contract!.id, file),
    onSuccess: () => toast({ title: "Agreement uploaded" }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  if (isLoading) return <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  if (!contract) {
    if (!canWrite) {
      return <EmptyState icon={Landmark} title="No sponsor linked to this batch" />;
    }
    return <LinkSponsorForm batchId={batchId} sponsors={sponsors ?? []} invalidateKey={invalidateKey} />;
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-100 rounded-xl px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">{contract.sponsor.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {contract.contractedStudentCount} students · {formatCurrency(contract.totalContractAmount)} contract
              {contract.gstRate ? ` · ${contract.gstRate}% GST` : " · GST exempt"}
              {contract.tdsRate ? ` · ${contract.tdsRate}% TDS` : ""}
            </p>
          </div>
          <Badge variant={contract.status === "active" ? "success" : contract.status === "cancelled" ? "danger" : "default"}>
            {contract.status}
          </Badge>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Started {formatDate(contract.startDate)}{contract.endDate ? ` · Ends ${formatDate(contract.endDate)}` : ""}
        </p>
        {canEdit && (
          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 mt-3 cursor-pointer hover:text-violet-700">
            <Upload className="h-3.5 w-3.5" />
            {contract.documentUrl ? "Replace signed agreement" : "Upload signed agreement"}
            <input
              type="file" accept="application/pdf,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadMutation.mutate(f); }}
            />
          </label>
        )}
      </div>

      <MilestonesPanel contractId={contract.id} milestones={contract.milestones} invalidateKey={invalidateKey} />
    </div>
  );
}
