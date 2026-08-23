import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listRecruitments } from "@/api/govExams";
import { Badge, EmptyState, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useLang } from "@/i18n";

interface CalendarEvent {
  recruitmentId: string;
  slug: string;
  title: string;
  orgShortName: string;
  date: string;
  label: "applicationCloses" | "examDateLabel";
}

export function CalendarPage() {
  const { t, lang } = useLang();
  const { data, isLoading } = useQuery({ queryKey: ["recruitments", "all"], queryFn: () => listRecruitments({}) });

  const events = useMemo<CalendarEvent[]>(() => {
    if (!data) return [];
    const out: CalendarEvent[] = [];
    for (const r of data.data) {
      if (r.applicationEndDate) {
        out.push({ recruitmentId: r.id, slug: r.slug, title: r.title, orgShortName: r.organization.shortName, date: r.applicationEndDate, label: "applicationCloses" });
      }
      if (r.examDate) {
        out.push({ recruitmentId: r.id, slug: r.slug, title: r.title, orgShortName: r.organization.shortName, date: r.examDate, label: "examDateLabel" });
      }
    }
    return out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = new Date(event.date).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric" });
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return [...map.entries()];
  }, [events, lang]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <h1 className="font-heading text-2xl text-ink">{t("calendarTitle")}</h1>
      <p className="text-sm text-ink-soft mt-1">{t("calendarSubtitle")}</p>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : !groups.length ? (
          <EmptyState title={t("noUpcomingDates")} description={t("noUpcomingDatesDesc")} />
        ) : (
          <div className="space-y-6">
            {groups.map(([month, monthEvents]) => (
              <div key={month}>
                <h2 className="text-sm font-bold text-ink-soft uppercase tracking-wide mb-2">{month}</h2>
                <div className="space-y-2">
                  {monthEvents.map((event, i) => (
                    <Link
                      key={`${event.recruitmentId}-${event.label}-${i}`}
                      to={`/jobs/${event.slug}`}
                      className="flex items-center gap-4 bg-white rounded-2xl border border-ink/[0.06] p-4 hover:shadow-card transition-shadow"
                    >
                      <div className="text-center shrink-0 w-14">
                        <p className="text-lg font-bold text-primary">{new Date(event.date).getDate()}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{event.title}</p>
                        <p className="text-xs text-ink-soft">{formatDate(event.date, lang)}</p>
                      </div>
                      <Badge>{t(event.label)}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
