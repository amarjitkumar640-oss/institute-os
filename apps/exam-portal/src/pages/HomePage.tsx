import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { listRecruitments, listCurrentAffairs, type GovOrgType } from "@/api/govExams";
import { RecruitmentCard, CurrentAffairCard } from "@/components/cards";
import { EmptyState, RouteButton, Skeleton } from "@/components/ui";
import { useLang } from "@/i18n";

export function HomePage() {
  const { t } = useLang();
  const { data: recruitments, isLoading: loadingRecruitments } = useQuery({
    queryKey: ["recruitments", "home"],
    queryFn: () => listRecruitments({ limit: 5 }),
  });
  const { data: currentAffairs, isLoading: loadingCurrentAffairs } = useQuery({
    queryKey: ["current-affairs", "home"],
    queryFn: () => listCurrentAffairs({ limit: 5 }),
  });

  const ORG_TYPES: { type: GovOrgType; label: string }[] = [
    { type: "ssc", label: t("orgSSC") },
    { type: "banking", label: t("orgBanking") },
    { type: "railway", label: t("orgRailway") },
    { type: "other", label: t("orgOtherHome") },
  ];

  return (
    <div>
      {/* Same eyebrow-badge + Fredoka-heading + gradient-CTA pattern as apps/site's hero. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/[0.06] to-transparent">
        <div className="max-w-[760px] mx-auto px-6 py-10 text-center">
          <span className="inline-flex items-center gap-2 bg-white border border-primary/15 px-4 py-2 rounded-full text-[12.5px] font-bold text-primary mb-5">
            {t("homeEyebrow")}
          </span>
          <h1 className="font-heading text-[clamp(28px,5vw,48px)] leading-tight text-ink">
            {t("homeTitle")} <span className="text-primary">{t("homeTitleHighlight")}</span>
          </h1>
          <p className="mt-4 text-[17px] text-ink-soft max-w-xl mx-auto leading-relaxed">
            {t("homeSubtitle")}
          </p>
          <div className="mt-8 flex justify-center">
            <RouteButton to="/eligibility-checker">
              {t("checkEligibility")} <ArrowRight className="h-4 w-4" />
            </RouteButton>
          </div>
        </div>
      </section>

      <section className="max-w-[1140px] mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-3">
          {ORG_TYPES.map(({ type, label }) => (
            <Link
              key={type}
              to={`/jobs?type=${type}`}
              className="px-4 py-2 rounded-xl bg-white border border-ink/[0.06] text-sm font-semibold text-ink-soft hover:border-primary/40 hover:text-primary transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-[1140px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg text-ink">{t("latestVacancies")}</h2>
          <Link to="/jobs" className="text-sm font-semibold text-primary flex items-center gap-1">{t("viewAll")} <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {loadingRecruitments ? (
          <div className="grid sm:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : !recruitments?.data.length ? (
          <EmptyState title={t("noVacanciesYet")} description={t("noVacanciesYetDesc")} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {recruitments.data.map((r) => <RecruitmentCard key={r.id} recruitment={r} />)}
          </div>
        )}
      </section>

      <section className="max-w-[1140px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg text-ink">{t("todaysCurrentAffairs")}</h2>
          <Link to="/current-affairs" className="text-sm font-semibold text-primary flex items-center gap-1">{t("viewAll")} <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {loadingCurrentAffairs ? (
          <div className="grid sm:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : !currentAffairs?.data.length ? (
          <EmptyState title={t("noCurrentAffairsYet")} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {currentAffairs.data.map((ca) => <CurrentAffairCard key={ca.id} currentAffair={ca} />)}
          </div>
        )}
      </section>
    </div>
  );
}
