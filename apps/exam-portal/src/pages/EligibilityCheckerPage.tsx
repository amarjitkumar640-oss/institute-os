import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { checkEligibility, type GovRecruitment } from "@/api/govExams";
import { RecruitmentCard } from "@/components/cards";
import { Button, EmptyState } from "@/components/ui";
import { useLang } from "@/i18n";

export function EligibilityCheckerPage() {
  const { t } = useLang();
  const [age, setAge] = useState("");
  const [qualification, setQualification] = useState("");
  const [category, setCategory] = useState("");
  const [results, setResults] = useState<GovRecruitment[] | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      checkEligibility({
        age: Number(age),
        qualification: qualification || undefined,
        category: category || undefined,
      }),
    onSuccess: (data) => setResults(data),
  });

  const ageValid = Number.isInteger(Number(age)) && Number(age) > 0 && Number(age) < 100;

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <h1 className="font-heading text-2xl text-ink">{t("eligibilityTitle")}</h1>
      <p className="text-sm text-ink-soft mt-1 leading-relaxed">
        {t("eligibilitySubtitle")}
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (ageValid) mutation.mutate(); }}
        className="mt-6 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">{t("fieldAge")}</label>
          <input
            type="number" required min={1} max={99} value={age} onChange={(e) => setAge(e.target.value)}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={t("placeholderAge")}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">{t("fieldQualification")}</label>
          <input
            value={qualification} onChange={(e) => setQualification(e.target.value)}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={t("placeholderQualification")}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">{t("fieldCategory")}</label>
          <input
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder={t("placeholderCategory")}
          />
        </div>
        <Button type="submit" disabled={!ageValid || mutation.isPending} className="w-full justify-center">
          {mutation.isPending ? t("checkingButton") : t("checkEligibilityButton")}
        </Button>
      </form>

      {results && (
        <div className="mt-8">
          <h2 className="font-heading text-lg text-ink mb-3">
            {results.length
              ? t("eligibleForCountTemplate").replace("{n}", String(results.length)).replace("{noun}", results.length === 1 ? t("vacancySingular") : t("vacancyPlural"))
              : t("noMatchesFound")}
          </h2>
          {!results.length ? (
            <EmptyState title={t("noEligibleVacancies")} description={t("noEligibleVacanciesDesc")} />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {results.map((r) => <RecruitmentCard key={r.id} recruitment={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
