import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordPaymentSchema } from "@institute-os/shared";
import { type z } from "zod";
import { getFeeSchedule, recordPayment, applyDiscount } from "@/api/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/FormField";
import { toast } from "@/components/ui/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";

type RecordPaymentForm = z.infer<typeof recordPaymentSchema>;

const STATUS_COLORS: Record<string, "default" | "success" | "danger" | "warning" | "info"> = {
  pending: "info",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  waived: "default",
  deferred: "default",
};

function RecordPaymentDialog({
  scheduleId,
  installmentId,
  open,
  onClose,
}: {
  scheduleId: string;
  installmentId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<RecordPaymentForm>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { scheduleId, installmentId, paidAt: today, mode: "cash" },
  });

  const mutation = useMutation({
    mutationFn: recordPayment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-schedule"] });
      toast({ title: "Payment recorded" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Failed to record payment" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <FormField label="Amount (₹)" error={errors.amount} required>
            <Input {...register("amount", { valueAsNumber: true })} type="number" min={1} />
          </FormField>
          <FormField label="Payment Mode" error={errors.mode} required>
            <Select onValueChange={(v) => setValue("mode", v as RecordPaymentForm["mode"])} defaultValue="cash">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Date" error={errors.paidAt} required>
            <Input {...register("paidAt")} type="date" />
          </FormField>
          <FormField label="UPI Reference" error={errors.upiRef}>
            <Input {...register("upiRef")} placeholder="Optional" />
          </FormField>
          <FormField label="Notes" error={errors.notes}>
            <Input {...register("notes")} placeholder="Optional" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Record Payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDiscountDialog({ scheduleId, open, onClose }: { scheduleId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleApply() {
    setLoading(true);
    try {
      await applyDiscount(scheduleId, { discountAmount: amount, discountReason: reason || undefined });
      qc.invalidateQueries({ queryKey: ["fee-schedule"] });
      toast({ title: "Discount applied" });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Failed to apply discount" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Apply Discount</DialogTitle></DialogHeader>
        <FormField label="Discount Amount (₹)">
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} min={0} />
        </FormField>
        <FormField label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleApply} disabled={loading}>Apply Discount</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeeDetailPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const [paymentFor, setPaymentFor] = useState<{ scheduleId: string; installmentId?: string } | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ["fee-schedule", enrollmentId],
    queryFn: () => getFeeSchedule(enrollmentId!),
    enabled: !!enrollmentId,
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  if (!schedule) return <div className="p-6 text-gray-500">No fee schedule found</div>;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center gap-4 border-b border-gray-100 bg-white px-6 py-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fees")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {schedule.enrollment?.student.fullName ?? "Fee Schedule"}
          </h1>
          <p className="text-sm text-gray-500">{schedule.enrollment?.batch.name}</p>
        </div>
        <Button variant="outline" onClick={() => setShowDiscount(true)}>Apply Discount</Button>
        <Button onClick={() => setPaymentFor({ scheduleId: schedule.id })}>Record Payment</Button>
      </div>

      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Fee</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(schedule.totalFee)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Discount</p>
              <p className="text-xl font-bold mt-1 text-green-600">{formatCurrency(schedule.discountAmount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Effective Fee</p>
              <p className="text-xl font-bold mt-1">{formatCurrency(schedule.effectiveFee)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
              <p className={`text-xl font-bold mt-1 ${schedule.pendingAmount > 0 ? "text-red-600" : "text-green-600"}`}>
                {formatCurrency(schedule.pendingAmount)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
              <Badge
                variant={schedule.status === "completed" ? "success" : schedule.status === "overdue" ? "danger" : "info"}
                className="mt-2"
              >
                {schedule.status}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Installments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(schedule.installments ?? []).length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No installments yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">#</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Label</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Due</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Amount</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Paid</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(schedule.installments ?? []).map((inst, i) => (
                    <tr key={inst.id} className="border-t border-gray-50">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3">{inst.label}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(inst.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(inst.plannedAmount)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(inst.paidAmount)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_COLORS[inst.status] ?? "default"}>{inst.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {inst.status !== "paid" && inst.status !== "waived" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPaymentFor({ scheduleId: schedule.id, installmentId: inst.id })}
                          >
                            Pay
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {paymentFor && (
        <RecordPaymentDialog
          scheduleId={paymentFor.scheduleId}
          installmentId={paymentFor.installmentId}
          open={!!paymentFor}
          onClose={() => setPaymentFor(null)}
        />
      )}
      {showDiscount && (
        <ApplyDiscountDialog scheduleId={schedule.id} open={showDiscount} onClose={() => setShowDiscount(false)} />
      )}
    </div>
  );
}
