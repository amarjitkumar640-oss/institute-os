import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { checkEligibility, type GovRecruitment } from "@/api/govExams";
import { RecruitmentCard } from "@/components/cards";
import { Button, EmptyState } from "@/components/ui";

export function EligibilityCheckerPage() {
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
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="font-heading text-2xl text-ink">Check My Eligibility</h1>
      <p className="text-sm text-ink-soft mt-1 leading-relaxed">
        Enter your details to see which published vacancies you're eligible for based on age and category relaxation.
        This is a rule-based check against published recruitments, not a guarantee of selection — always confirm against the official notification.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (ageValid) mutation.mutate(); }}
        className="mt-6 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card space-y-4"
      >
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">Age *</label>
          <input
            type="number" required min={1} max={99} value={age} onChange={(e) => setAge(e.target.value)}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. 23"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">Qualification</label>
          <input
            value={qualification} onChange={(e) => setQualification(e.target.value)}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. Graduate / B.Com"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink mb-1">Category</label>
          <input
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-ink/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. general, obc, sc_st (for age relaxation)"
          />
        </div>
        <Button type="submit" disabled={!ageValid || mutation.isPending} className="w-full justify-center">
          {mutation.isPending ? "Checking..." : "Check Eligibility"}
        </Button>
      </form>

      {results && (
        <div className="mt-8">
          <h2 className="font-heading text-lg text-ink mb-3">
            {results.length ? `You may be eligible for ${results.length} vacanc${results.length === 1 ? "y" : "ies"}` : "No matches found"}
          </h2>
          {!results.length ? (
            <EmptyState title="No eligible vacancies right now" description="Try adjusting your details, or check back as new vacancies are published." />
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
