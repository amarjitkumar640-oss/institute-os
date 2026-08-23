import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listCurrentAffairs, type GovCurrentAffairCategory } from "@/api/govExams";
import { CurrentAffairCard } from "@/components/cards";
import { EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const CATEGORIES: { value: GovCurrentAffairCategory; label: string }[] = [
  { value: "national", label: "National" },
  { value: "international", label: "International" },
  { value: "banking", label: "Banking" },
  { value: "economy", label: "Economy" },
  { value: "science", label: "Science" },
  { value: "technology", label: "Technology" },
  { value: "defence", label: "Defence" },
  { value: "sports", label: "Sports" },
  { value: "awards", label: "Awards" },
  { value: "appointments", label: "Appointments" },
  { value: "govt_schemes", label: "Govt. Schemes" },
  { value: "environment", label: "Environment" },
];

export function CurrentAffairsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") as GovCurrentAffairCategory | null;

  const { data, isLoading } = useQuery({
    queryKey: ["current-affairs", "all", category],
    queryFn: () => listCurrentAffairs(category ? { category } : {}),
  });

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-10">
      <h1 className="font-heading text-2xl text-ink">Current Affairs</h1>
      <p className="text-sm text-ink-soft mt-1">Daily updates relevant to SSC, Banking, Railway, and other competitive exams.</p>

      <div className="flex flex-wrap gap-2 mt-5">
        <button
          onClick={() => setSearchParams({})}
          className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", !category ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setSearchParams({ category: c.value })}
            className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", category === c.value ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : !data?.data.length ? (
          <EmptyState title="No current affairs found" description="Try a different category, or check back later." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {data.data.map((ca) => <CurrentAffairCard key={ca.id} currentAffair={ca} />)}
          </div>
        )}
      </div>
    </div>
  );
}
