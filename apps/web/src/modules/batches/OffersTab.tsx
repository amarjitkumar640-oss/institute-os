import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Tag } from "lucide-react";
import {
  listBatchOffers, createBatchOffer, updateBatchOffer, deleteBatchOffer,
  type BatchDiscountOffer,
} from "@/api/batches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/FormField";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import { usePermission } from "@/hooks/usePermission";

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof msg === "string" ? msg : "Something went wrong";
}

function CreateOfferDialog({ batchId, open, onClose }: { batchId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [discountAmount, setDiscountAmount] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [errors, setErrors] = useState<{ discountAmount?: string; maxRedemptions?: string }>({});

  const mutation = useMutation({
    mutationFn: () => createBatchOffer(batchId, {
      discountAmount: Number(discountAmount),
      maxRedemptions: Number(maxRedemptions),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batch-offers", batchId] });
      toast({ title: "Offer created" });
      onClose();
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleSubmit() {
    const errs: typeof errors = {};
    const amt = Number(discountAmount);
    const max = Number(maxRedemptions);
    if (discountAmount.trim() === "" || isNaN(amt) || amt <= 0) errs.discountAmount = "Enter a valid discount amount.";
    if (maxRedemptions.trim() === "" || !Number.isInteger(max) || max <= 0) errs.maxRedemptions = "Enter a valid student count.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Discount Offer</DialogTitle></DialogHeader>
        <FormField label="Discount Amount (₹)" error={errors.discountAmount ? { message: errors.discountAmount } as never : undefined} required>
          <Input type="number" min={0} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="e.g. 1000" />
        </FormField>
        <FormField label="First N Students" error={errors.maxRedemptions ? { message: errors.maxRedemptions } as never : undefined} required>
          <Input type="number" min={1} value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="e.g. 10" />
        </FormField>
        <p className="text-xs text-gray-400">
          Auto-applied to each of the first {maxRedemptions || "N"} students admitted into this batch — takes priority over the course's standing discount while slots remain.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>Create Offer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OffersTab({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const { canEdit, canDelete } = usePermission("batches");
  const [showCreate, setShowCreate] = useState(false);

  const { data: offers, isLoading } = useQuery({
    queryKey: ["batch-offers", batchId],
    queryFn: () => listBatchOffers(batchId),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateBatchOffer(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["batch-offers", batchId] }),
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBatchOffer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["batch-offers", batchId] });
      toast({ title: "Offer deleted" });
    },
    onError: (err: unknown) => toast({ variant: "destructive", title: extractError(err) }),
  });

  function handleDelete(offer: BatchDiscountOffer) {
    if (confirm(`Delete this ${formatCurrency(offer.discountAmount)} offer?`)) {
      deleteMutation.mutate(offer.id);
    }
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Give the first N students admitted into this batch an extra discount. Takes priority over the course's standing discount while slots remain.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Offer
          </Button>
        )}
      </div>

      {!offers?.length ? (
        <EmptyState icon={Tag} title="No discount offers yet" actionLabel={canEdit ? "New Offer" : undefined} onAction={canEdit ? () => setShowCreate(true) : undefined} />
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => {
            const exhausted = offer.redeemedCount >= offer.maxRedemptions;
            return (
              <div key={offer.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(offer.discountAmount)} off</p>
                    {exhausted && <Badge variant="default">exhausted</Badge>}
                    {!offer.isActive && <Badge variant="warning">inactive</Badge>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {offer.redeemedCount} / {offer.maxRedemptions} students redeemed
                  </p>
                </div>
                {canEdit && (
                  <Switch
                    checked={offer.isActive}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: offer.id, isActive: checked })}
                  />
                )}
                {canDelete && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(offer)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateOfferDialog batchId={batchId} open={showCreate} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
