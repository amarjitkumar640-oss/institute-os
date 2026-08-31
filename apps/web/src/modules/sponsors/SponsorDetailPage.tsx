import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Landmark } from "lucide-react";
import { getSponsor } from "@/api/sponsors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MilestonesPanel } from "./MilestonesPanel";

export function SponsorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: sponsor, isLoading } = useQuery({
    queryKey: ["sponsor", id],
    queryFn: () => getSponsor(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!sponsor) return null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/sponsors")} className="mb-2 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Sponsors
        </Button>
        <h1 className="text-xl font-bold text-gray-900">{sponsor.name}</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {[sponsor.contactPerson, sponsor.phone, sponsor.email].filter(Boolean).join(" · ") || "No contact details"}
        </p>
        {sponsor.gstin && <p className="text-xs text-gray-400 mt-0.5 font-mono">GSTIN: {sponsor.gstin}</p>}
      </div>

      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Sponsorship Contracts</p>
        {!sponsor.contracts.length ? (
          <EmptyState icon={Landmark} title="No contracts yet" description="Link this sponsor to a batch from that batch's Sponsorship tab." />
        ) : (
          <div className="space-y-5">
            {sponsor.contracts.map((contract) => (
              <div key={contract.id} className="bg-gray-50 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <button className="text-sm font-semibold text-gray-900 hover:underline" onClick={() => navigate(`/batches/${contract.batch.id}`)}>
                      {contract.batch.name}
                    </button>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {contract.contractedStudentCount} students · {formatCurrency(contract.totalContractAmount)}
                      {contract.gstRate ? ` · ${contract.gstRate}% GST` : " · GST exempt"} · since {formatDate(contract.startDate)}
                    </p>
                  </div>
                  <Badge variant={contract.status === "active" ? "success" : contract.status === "cancelled" ? "danger" : "default"}>
                    {contract.status}
                  </Badge>
                </div>
                <MilestonesPanel contractId={contract.id} milestones={contract.milestones} invalidateKey={["sponsor", id]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
