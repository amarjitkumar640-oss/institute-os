import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Receipt, Search } from "lucide-react";
import { listPayments, type CollectionPeriod, type PaymentRow } from "@/api/fees";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatCurrency, formatDate } from "@/lib/utils";

const MODE_LABEL: Record<PaymentRow["mode"], string> = {
  cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank Transfer", cheque: "Cheque",
};

// The exact string legacy-import.service.ts writes for every backfilled
// paper-register row — reused as-is rather than adding a schema column,
// since it's the one thing that already reliably distinguishes a live,
// staff-recorded payment from a historical one entered after the fact.
const LEGACY_IMPORT_NOTE = "Imported from legacy paper register";

interface PaymentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: CollectionPeriod;
  batchId?: string;
  title: string;
}

export function PaymentDetailsDialog({ open, onOpenChange, period, batchId, title }: PaymentDetailsDialogProps) {
  const [search, setSearch] = useState("");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["fee-payments", period, batchId],
    queryFn:  () => listPayments({ period, batchId }),
    enabled:  open,
  });

  const filtered = useMemo(() => {
    if (!payments) return payments;
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) =>
      p.schedule.enrollment.student.fullName.toLowerCase().includes(q) ||
      p.schedule.enrollment.batch.name.toLowerCase().includes(q) ||
      (p.collectedBy?.fullName.toLowerCase().includes(q) ?? false) ||
      p.receiptNo.toLowerCase().includes(q)
    );
  }, [payments, search]);

  const columns: ColumnDef<PaymentRow>[] = [
    {
      accessorKey: "paidAt",
      header: "Date",
      cell: ({ row }) => formatDate(row.original.paidAt),
    },
    {
      id: "student",
      header: "Student",
      cell: ({ row }) => <TruncatedText text={row.original.schedule.enrollment.student.fullName} className="max-w-[160px]" />,
    },
    {
      id: "batch",
      header: "Batch",
      cell: ({ row }) => <TruncatedText text={row.original.schedule.enrollment.batch.name} className="max-w-[140px]" />,
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span className="text-emerald-700 font-medium">{formatCurrency(row.original.amount)}</span>,
    },
    {
      id: "mode",
      header: "Mode",
      cell: ({ row }) => MODE_LABEL[row.original.mode],
    },
    {
      id: "collectedBy",
      header: "Collected By",
      cell: ({ row }) => <TruncatedText text={row.original.collectedBy?.fullName ?? "—"} className="max-w-[140px]" />,
    },
    {
      accessorKey: "receiptNo",
      header: "Receipt No",
      cell: ({ row }) => <TruncatedText text={row.original.receiptNo} className="max-w-[120px]" />,
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => (
        row.original.notes === LEGACY_IMPORT_NOTE
          ? <Badge variant="warning">Legacy Import</Badge>
          : null
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {!isLoading && payments && payments.length === 0 && (
          <EmptyState icon={Receipt} title="No payments in this period" />
        )}

        {!isLoading && payments && payments.length > 0 && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search by student, batch, receipt no, or collected by..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {filtered && filtered.length === 0 ? (
              <EmptyState icon={Search} title="No matching payments" description="Try a different search term." />
            ) : (
              <DataTable columns={columns} data={filtered ?? []} pageSize={10} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
