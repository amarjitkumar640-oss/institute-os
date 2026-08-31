import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Download, Link2, CheckCircle2 } from "lucide-react";
import {
  createMilestone, markMilestoneReceived, generateInvoice, getInvoiceDownloadUrl,
  type Milestone, type SponsorInvoice,
} from "@/api/sponsors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { toast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function AddMilestoneDialog({ contractId, open, onClose, invalidateKey }: {
  contractId: string; open: boolean; onClose: () => void; invalidateKey: unknown[];
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => createMilestone(contractId, { label: label.trim(), amount: Number(amount) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      toast({ title: "Milestone added" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleSubmit() {
    if (!label.trim()) { setError("Label is required."); return; }
    const amt = Number(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) { setError("Enter a valid amount."); return; }
    setError(undefined);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Payment Milestone</DialogTitle></DialogHeader>
        <FormField label="Label" error={error && !label.trim() ? { message: error } as never : undefined} required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Advance, On completion" />
        </FormField>
        <FormField label="Amount (₹)" error={error && label.trim() ? { message: error } as never : undefined} required>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 50000" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveMilestoneDialog({ milestone, open, onClose, invalidateKey }: {
  milestone: Milestone; open: boolean; onClose: () => void; invalidateKey: unknown[];
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(milestone.amount));
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => markMilestoneReceived(milestone.id, { receivedAmount: Number(amount) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      toast({ title: "Marked as received" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleSubmit() {
    const amt = Number(amount);
    if (!amount.trim() || isNaN(amt) || amt <= 0) { setError("Enter a valid amount."); return; }
    setError(undefined);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Mark "{milestone.label}" Received</DialogTitle></DialogHeader>
        <FormField label="Amount Received (₹)" error={error ? { message: error } as never : undefined} required>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function copyShareLink(shareToken: string) {
  const url = `${window.location.origin}/invoice/${shareToken}`;
  try {
    await navigator.clipboard.writeText(url);
    toast({ title: "Share link copied" });
  } catch {
    toast({ variant: "destructive", title: "Could not copy link", description: url });
  }
}

async function downloadInvoice(invoiceId: string) {
  try {
    const { downloadUrl } = await getInvoiceDownloadUrl(invoiceId);
    window.location.href = downloadUrl;
  } catch {
    toast({ variant: "destructive", title: "Could not fetch the invoice" });
  }
}

export function MilestonesPanel({ contractId, milestones, invalidateKey }: {
  contractId: string;
  milestones: (Milestone & { invoice: SponsorInvoice | null })[];
  invalidateKey: unknown[];
}) {
  const qc = useQueryClient();
  const { canWrite, canEdit } = usePermission("sponsors");
  const [showAdd, setShowAdd] = useState(false);
  const [receiving, setReceiving] = useState<Milestone | undefined>();

  const invoiceMutation = useMutation({
    mutationFn: generateInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
      toast({ title: "Invoice generated" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Payment Milestones</p>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Milestone
          </Button>
        )}
      </div>

      {!milestones.length ? (
        <p className="text-sm text-gray-400">No milestones yet — a lump-sum contract just needs one.</p>
      ) : (
        <div className="space-y-2">
          {milestones.map((m) => (
            <div key={m.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{m.label}</p>
                    <Badge variant={m.status === "received" ? "success" : "default"}>{m.status}</Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(m.amount)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.status === "pending" && canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setReceiving(m)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Received
                    </Button>
                  )}
                  {!m.invoice ? (
                    canEdit && (
                      <Button size="sm" variant="outline" onClick={() => invoiceMutation.mutate(m.id)} disabled={invoiceMutation.isPending}>
                        <FileText className="h-3.5 w-3.5 mr-1" /> Generate Invoice
                      </Button>
                    )
                  ) : (
                    <>
                      <span className="text-xs font-mono text-gray-400">{m.invoice.invoiceNumber}</span>
                      <Button size="sm" variant="ghost" onClick={() => downloadInvoice(m.invoice!.id)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyShareLink(m.invoice!.shareToken)}>
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {m.status === "received" && m.receivedAt && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Received {formatCurrency(m.receivedAmount ?? m.amount)} on {formatDate(m.receivedAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddMilestoneDialog contractId={contractId} open={showAdd} onClose={() => setShowAdd(false)} invalidateKey={invalidateKey} />}
      {receiving && <ReceiveMilestoneDialog milestone={receiving} open={!!receiving} onClose={() => setReceiving(undefined)} invalidateKey={invalidateKey} />}
    </div>
  );
}
