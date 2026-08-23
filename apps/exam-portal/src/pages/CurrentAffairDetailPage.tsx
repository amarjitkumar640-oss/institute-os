import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { getCurrentAffair } from "@/api/govExams";
import { Badge, EmptyState, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export function CurrentAffairDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: ca, isLoading, isError } = useQuery({
    queryKey: ["current-affair", slug],
    queryFn: () => getCurrentAffair(slug!),
    enabled: !!slug,
  });

  if (isLoading) {
    return <div className="max-w-3xl mx-auto px-6 py-10 space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40" /></div>;
  }
  if (isError || !ca) {
    return <EmptyState title="Not found" description="This article may have been removed or the link is incorrect." />;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Badge>{ca.category.replace("_", " ")}</Badge>
      <h1 className="mt-2.5 font-heading text-2xl text-ink">{ca.title}</h1>
      <p className="mt-1 text-xs text-ink-soft">{formatDate(ca.publishedDate)}</p>

      <div className="mt-6 bg-white rounded-3xl border border-ink/[0.06] p-5 shadow-card space-y-4">
        <div>
          <h2 className="font-heading text-[15.5px] text-ink mb-1">What happened?</h2>
          <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{ca.whatHappened}</p>
        </div>

        {!!ca.keyFacts?.length && (
          <div>
            <h2 className="font-heading text-[15.5px] text-ink mb-1">Key Facts</h2>
            <ul className="list-disc list-inside text-sm text-ink-soft space-y-1">
              {ca.keyFacts.map((fact, i) => <li key={i}>{fact}</li>)}
            </ul>
          </div>
        )}

        {ca.whyImportant && (
          <div>
            <h2 className="font-heading text-[15.5px] text-ink mb-1">Why is it important?</h2>
            <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">{ca.whyImportant}</p>
          </div>
        )}

        {ca.examRelevance && Object.keys(ca.examRelevance).length > 0 && (
          <div>
            <h2 className="font-heading text-[15.5px] text-ink mb-2">Exam Relevance</h2>
            <div className="space-y-2">
              {Object.entries(ca.examRelevance).map(([exam, relevance]) => (
                <div key={exam} className="bg-ink/[0.02] rounded-xl p-3">
                  <p className="text-xs font-bold text-primary uppercase">{exam}</p>
                  <p className="text-sm text-ink-soft mt-0.5">{relevance}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
