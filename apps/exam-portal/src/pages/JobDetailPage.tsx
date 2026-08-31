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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card">
      <h2 className="font-heading text-[15.5px] text-ink mb-3">{title}</h2>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-ink-soft">
          <span className="text-ink/30">•</span> {item}
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-ink-soft">
          <span className="text-ink/40 font-semibold">{i + 1}.</span> {item}
        </li>
      ))}
    </ol>
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
      {recruitment.organization && <Badge>{recruitment.organization}</Badge>}
      <h1 className="mt-2.5 font-heading text-2xl text-ink">{recruitment.title}</h1>
      {recruitment.summary && <p className="mt-2 text-sm text-ink-soft leading-relaxed">{recruitment.summary}</p>}

      <div className="mt-6 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card">
        <InfoRow label={t("infoOrganization")} value={recruitment.organization} />
        <InfoRow label={t("infoDepartment")} value={recruitment.department} />
        <InfoRow label={t("infoTotalVacancies")} value={recruitment.totalVacancies} />
        <InfoRow label={t("infoQualification")} value={recruitment.qualification} />
        <InfoRow
          label={t("infoAgeLimit")}
          value={recruitment.ageMin != null || recruitment.ageMax != null ? `${recruitment.ageMin ?? "—"} – ${recruitment.ageMax ?? "—"} ${t("infoAgeYearsSuffix")}` : null}
        />
        <InfoRow label={t("infoApplicationStart")} value={formatDate(recruitment.applicationStartDate, lang)} />
        <InfoRow label={t("infoApplicationEnd")} value={formatDate(recruitment.applicationEndDate, lang)} />
        <InfoRow label={t("infoExamDate")} value={formatDate(recruitment.examDate, lang)} />
        <InfoRow label={t("infoJobLocation")} value={recruitment.jobLocation} />
        <InfoRow label={t("infoAdvertisementNumber")} value={recruitment.advertisementNumber} />
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

      {!!recruitment.highlights?.length && (
        <Section title={t("keyHighlights")}>
          <BulletList items={recruitment.highlights} />
        </Section>
      )}

      {recruitment.postsByCategory && Object.keys(recruitment.postsByCategory).length > 0 && (
        <Section title={t("vacancyBreakdown")}>
          <div className="flex flex-wrap gap-2">
            {Object.entries(recruitment.postsByCategory).map(([category, count]) => (
              <Badge key={category}>{category.toUpperCase()}: {count}</Badge>
            ))}
          </div>
        </Section>
      )}

      {(recruitment.payScale || recruitment.salaryRange || recruitment.basicPay || recruitment.otherBenefits) && (
        <Section title={t("salaryHeading")}>
          <InfoRow label="Pay Scale" value={recruitment.payScale} />
          <InfoRow label="Basic Pay" value={recruitment.basicPay} />
          <InfoRow label="Salary Range" value={recruitment.salaryRange} />
          {recruitment.otherBenefits && <p className="text-sm text-ink-soft mt-2">{recruitment.otherBenefits}</p>}
        </Section>
      )}

      {!!recruitment.selectionProcess?.length && (
        <Section title={t("selectionProcessHeading")}>
          <NumberedList items={recruitment.selectionProcess} />
        </Section>
      )}

      {recruitment.examPattern && (recruitment.examPattern.mode || recruitment.examPattern.stages?.length || recruitment.examPattern.duration || recruitment.examPattern.negativeMarking) && (
        <Section title={t("examPatternHeading")}>
          <InfoRow label={t("examPatternMode")} value={recruitment.examPattern.mode} />
          <InfoRow label={t("examPatternDuration")} value={recruitment.examPattern.duration} />
          <InfoRow label={t("examPatternNegativeMarking")} value={recruitment.examPattern.negativeMarking} />
          {!!recruitment.examPattern.stages?.length && <div className="mt-2"><BulletList items={recruitment.examPattern.stages} /></div>}
        </Section>
      )}

      {!!recruitment.applicationProcess?.length && (
        <Section title={t("howToApplyHeading")}>
          <NumberedList items={recruitment.applicationProcess} />
        </Section>
      )}

      {recruitment.whoCanApply && (
        <Section title={t("whoCanApplyHeading")}>
          <p className="text-sm text-ink-soft leading-relaxed">{recruitment.whoCanApply}</p>
        </Section>
      )}

      {recruitment.importantNote && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-3xl p-5">
          <h2 className="font-heading text-[15.5px] text-amber-900 mb-1.5">{t("importantNoteHeading")}</h2>
          <p className="text-sm text-amber-800 leading-relaxed">{recruitment.importantNote}</p>
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
