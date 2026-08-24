import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ExternalLink, FileText } from "lucide-react";
import { getRecruitment, type GovDocumentType } from "@/api/govExams";
import { Badge, EmptyState, LinkButton, RouteButton, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useLang } from "@/i18n";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between py-2 border-b border-ink/[0.06] last:border-0">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-sm font-semibold text-ink text-right">{value}</span>
    </div>
  );
}

export function JobDetailPage() {
  const { t, lang } = useLang();
  const { slug } = useParams<{ slug: string }>();
  const { data: recruitment, isLoading, isError } = useQuery({
    queryKey: ["recruitment", slug],
    queryFn: () => getRecruitment(slug!),
    enabled: !!slug,
  });

  const DOC_TYPE_LABEL: Record<GovDocumentType, string> = {
    admit_card: t("docAdmitCard"), result: t("docResult"), answer_key: t("docAnswerKey"), notification: t("docNotification"), syllabus: t("docSyllabus"),
  };

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-6 py-6 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div>;
  }
  if (isError || !recruitment) {
    return <EmptyState title={t("jobNotFound")} description={t("jobNotFoundDesc")} />;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <Badge>{recruitment.organization.shortName}</Badge>
      <h1 className="mt-2.5 font-heading text-2xl text-ink">{recruitment.title}</h1>

      <div className="mt-6 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card">
        <InfoRow label={t("infoOrganization")} value={recruitment.organization.name} />
        <InfoRow label={t("infoTotalVacancies")} value={recruitment.totalVacancies} />
        <InfoRow label={t("infoQualification")} value={recruitment.qualification} />
        <InfoRow
          label={t("infoAgeLimit")}
          value={recruitment.ageMin != null || recruitment.ageMax != null ? `${recruitment.ageMin ?? "—"} – ${recruitment.ageMax ?? "—"} ${t("infoAgeYearsSuffix")}` : null}
        />
        <InfoRow label={t("infoApplicationStart")} value={formatDate(recruitment.applicationStartDate, lang)} />
        <InfoRow label={t("infoApplicationEnd")} value={formatDate(recruitment.applicationEndDate, lang)} />
        <InfoRow label={t("infoExamDate")} value={formatDate(recruitment.examDate, lang)} />
      </div>

      {recruitment.categoryRelaxations && Object.keys(recruitment.categoryRelaxations).length > 0 && (
        <div className="mt-4 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card">
          <h2 className="font-heading text-[15.5px] text-ink mb-2">{t("ageRelaxation")}</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(recruitment.categoryRelaxations).map(([category, years]) => (
              <Badge key={category}>{category.toUpperCase()}: +{years} {t("ageRelaxationYearsSuffix")}</Badge>
            ))}
          </div>
        </div>
      )}

      {!!recruitment.documents?.length && (
        <div className="mt-4 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card">
          <h2 className="font-heading text-[15.5px] text-ink mb-3">{t("documentsHeading")}</h2>
          <div className="space-y-2">
            {recruitment.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.documentUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-ink/[0.02] hover:bg-ink/5 transition-colors"
              >
                <FileText className="h-4 w-4 text-ink-soft shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{doc.title}</p>
                  <Badge className="mt-1">{DOC_TYPE_LABEL[doc.type]}</Badge>
                </div>
                {doc.documentUrl && <ExternalLink className="h-3.5 w-3.5 text-ink-soft shrink-0" />}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {recruitment.applyUrl && (
          <LinkButton href={recruitment.applyUrl}>
            {t("applyNow")} <ExternalLink className="h-3.5 w-3.5" />
          </LinkButton>
        )}
        {recruitment.officialNotificationUrl && (
          <LinkButton href={recruitment.officialNotificationUrl} variant={recruitment.applyUrl ? "outline" : undefined}>
            {t("officialNotification")} <ExternalLink className="h-3.5 w-3.5" />
          </LinkButton>
        )}
        {recruitment.officialWebsiteUrl && (
          <LinkButton href={recruitment.officialWebsiteUrl} variant="outline">
            {t("officialWebsite")} <ExternalLink className="h-3.5 w-3.5" />
          </LinkButton>
        )}
        <RouteButton to="/eligibility-checker" variant="outline">{t("checkEligibility")}</RouteButton>
      </div>
    </div>
  );
}
