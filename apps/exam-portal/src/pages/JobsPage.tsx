import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listRecruitments, type GovOrgType } from "@/api/govExams";
import { RecruitmentCard } from "@/components/cards";
import { EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const ORG_TYPES: { type: GovOrgType; label: string }[] = [
  { type: "ssc", label: "SSC" },
  { type: "banking", label: "Banking" },
  { type: "railway", label: "Railway" },
  { type: "other", label: "Other" },
];

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeType = searchParams.get("type") as GovOrgType | null;

  const { data, isLoading } = useQuery({ queryKey: ["recruitments", "all"], queryFn: () => listRecruitments({}) });

  // The public API filters by organizationId, not organization type — with
  // a small number of recruitments, filtering the already-fetched list
  // client-side is simpler than adding a type filter to the backend for a
  // feature this size. Revisit if the list grows large enough to matter.
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!activeType) return data.data;
    return data.data.filter((r) => r.organization.type === activeType);
  }, [data, activeType]);

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-10">
      <h1 className="font-heading text-2xl text-ink">Government Jobs</h1>
      <p className="text-sm text-ink-soft mt-1">Latest vacancies across SSC, Banking, Railway, and other government organizations.</p>

      <div className="flex flex-wrap gap-2 mt-5">
        <button
          onClick={() => setSearchParams({})}
          className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", !activeType ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
        >
          All
        </button>
        {ORG_TYPES.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => setSearchParams({ type })}
            className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", activeType === type ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : !filtered.length ? (
          <EmptyState title="No jobs found" description="Try a different category, or check back later." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((r) => <RecruitmentCard key={r.id} recruitment={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
