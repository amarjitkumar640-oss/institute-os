import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listRecruitments, type GovOrgType } from "@/api/govExams";
import { RecruitmentCard } from "@/components/cards";
import { EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLang } from "@/i18n";

export function JobsPage() {
  const { t } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeType = searchParams.get("type") as GovOrgType | null;

  const ORG_TYPES: { type: GovOrgType; label: string }[] = [
    { type: "ssc", label: t("orgSSC") },
    { type: "banking", label: t("orgBanking") },
    { type: "railway", label: t("orgRailway") },
    { type: "other", label: t("orgOther") },
  ];

  const { data, isLoading } = useQuery({ queryKey: ["recruitments", "all"], queryFn: () => listRecruitments({}) });

  // With a small number of recruitments, filtering the already-fetched list
  // client-side is simpler than adding a category param to this request.
  // Revisit if the list grows large enough to matter.
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!activeType) return data.data;
    return data.data.filter((r) => r.category === activeType);
  }, [data, activeType]);

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-6">
      <h1 className="font-heading text-2xl text-ink">{t("jobsTitle")}</h1>
      <p className="text-sm text-ink-soft mt-1">{t("jobsSubtitle")}</p>

      <div className="flex flex-wrap gap-2 mt-5">
        <button
          onClick={() => setSearchParams({})}
          className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", !activeType ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
        >
          {t("filterAll")}
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
          <EmptyState title={t("noJobsFound")} description={t("tryDifferentCategory")} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {filtered.map((r) => <RecruitmentCard key={r.id} recruitment={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
