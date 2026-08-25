import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listCurrentAffairs, type GovCurrentAffairCategory } from "@/api/govExams";
import { CurrentAffairCard } from "@/components/cards";
import { EmptyState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLang } from "@/i18n";

export function CurrentAffairsPage() {
  const { t } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") as GovCurrentAffairCategory | null;

  const CATEGORIES: { value: GovCurrentAffairCategory; label: string }[] = [
    { value: "national", label: t("catNational") },
    { value: "international", label: t("catInternational") },
    { value: "banking", label: t("catBanking") },
    { value: "economy", label: t("catEconomy") },
    { value: "science", label: t("catScience") },
    { value: "technology", label: t("catTechnology") },
    { value: "defence", label: t("catDefence") },
    { value: "sports", label: t("catSports") },
    { value: "awards", label: t("catAwards") },
    { value: "appointments", label: t("catAppointments") },
    { value: "govt_schemes", label: t("catGovtSchemes") },
    { value: "environment", label: t("catEnvironment") },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ["current-affairs", "all", category],
    queryFn: () => listCurrentAffairs(category ? { category } : {}),
  });

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-6">
      <h1 className="font-heading text-2xl text-ink">{t("currentAffairsTitle")}</h1>
      <p className="text-sm text-ink-soft mt-1">{t("currentAffairsSubtitle")}</p>

      <div className="flex flex-wrap gap-2 mt-5">
        <button
          onClick={() => setSearchParams({})}
          className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", !category ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
        >
          {t("filterAll")}
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
          <EmptyState title={t("noCurrentAffairsFound")} description={t("tryDifferentCategory")} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {data.data.map((ca) => <CurrentAffairCard key={ca.id} currentAffair={ca} />)}
          </div>
        )}
      </div>
    </div>
  );
}
