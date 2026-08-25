import { Link } from "react-router-dom";
import { Calendar, Users } from "lucide-react";
import type { GovRecruitment, GovCurrentAffair } from "@/api/govExams";
import { Badge } from "./ui";
import { formatDate } from "@/lib/utils";
import { useLang, currentAffairCategoryLabel } from "@/i18n";

export function RecruitmentCard({ recruitment }: { recruitment: GovRecruitment }) {
  const { t, lang } = useLang();
  return (
    <Link
      to={`/jobs/${recruitment.slug}`}
      className="block bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card hover:shadow-card-md hover:-translate-y-0.5 transition-all"
    >
      <Badge>{recruitment.organization.shortName}</Badge>
      <h3 className="mt-2.5 font-heading text-[15.5px] text-ink">{recruitment.title}</h3>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-soft">
        {recruitment.totalVacancies != null && (
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {recruitment.totalVacancies} {t("vacanciesSuffix")}</span>
        )}
        {recruitment.applicationEndDate && (
          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {t("lastDate")}: {formatDate(recruitment.applicationEndDate, lang)}</span>
        )}
      </div>
    </Link>
  );
}

export function CurrentAffairCard({ currentAffair }: { currentAffair: GovCurrentAffair }) {
  const { t, lang } = useLang();
  return (
    <Link
      to={`/current-affairs/${currentAffair.slug}`}
      className="block bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card hover:shadow-card-md hover:-translate-y-0.5 transition-all"
    >
      <Badge>{currentAffairCategoryLabel(t, currentAffair.category)}</Badge>
      <h3 className="mt-2.5 font-heading text-[15.5px] text-ink">{currentAffair.title}</h3>
      <p className="mt-1 text-sm text-ink-soft line-clamp-2">{currentAffair.whatHappened}</p>
      <p className="mt-2 text-xs text-ink-soft/70">{formatDate(currentAffair.publishedDate, lang)}</p>
    </Link>
  );
}
