import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Calendar } from "lucide-react";
import { listCurrentAffairs, listCurrentAffairCategories, listCurrentAffairDates } from "@/api/govExams";
import { CurrentAffairCard } from "@/components/cards";
import { EmptyState, Skeleton } from "@/components/ui";
import { cn, formatShortDate, todayIso, yesterdayIso } from "@/lib/utils";
import { useLang } from "@/i18n";

// Date and category are independent, both "sticky" in the URL — switching
// one never resets the other. If that combination happens to have nothing
// published, the empty state says so plainly rather than silently
// substituting a different date/category the user didn't ask for.
function DateStrip({
  dates, selectedDate, onSelect, lang, t,
}: {
  dates: string[];
  selectedDate: string | undefined;
  onSelect: (date: string) => void;
  lang: "en" | "hi";
  t: (key: "dateToday" | "dateYesterday" | "jumpToDate") => string;
}) {
  const today = todayIso();
  const yesterday = yesterdayIso();
  const chipLabel = (d: string) => (d === today ? t("dateToday") : d === yesterday ? t("dateYesterday") : formatShortDate(d, lang));

  return (
    <div className="flex items-center gap-2 mt-5 overflow-x-auto pb-1">
      {dates.map((d) => (
        <button
          key={d}
          onClick={() => onSelect(d)}
          className={cn(
            "shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold",
            d === selectedDate ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft",
          )}
        >
          {chipLabel(d)}
        </button>
      ))}
      <label className="shrink-0 flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg bg-white border border-ink/[0.06] text-ink-soft cursor-pointer">
        <Calendar className="h-3.5 w-3.5" />
        <input
          type="date"
          value={selectedDate ?? ""}
          max={today}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          aria-label={t("jumpToDate")}
          className="bg-transparent outline-none text-sm font-semibold w-[92px]"
        />
      </label>
    </div>
  );
}

export function CurrentAffairsPage() {
  const { t, lang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") ?? undefined;
  const dateParam = searchParams.get("date") ?? undefined;
  const [showMore, setShowMore] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["current-affair-categories"],
    queryFn: listCurrentAffairCategories,
    staleTime: 5 * 60 * 1000,
  });
  const primaryCategories = categories?.filter((c) => c.priority === "primary") ?? [];
  const secondaryCategories = categories?.filter((c) => c.priority === "secondary") ?? [];
  const categoryLabel = (c: { labelEn: string; labelHi: string }) => (lang === "hi" ? c.labelHi : c.labelEn);

  // Which days actually have content for the current category filter —
  // also resolves the default view (dates[0], the latest date with
  // content) when the URL has no explicit ?date=.
  const { data: dates, isFetched: datesFetched } = useQuery({
    queryKey: ["current-affair-dates", category],
    queryFn: () => listCurrentAffairDates({ category, limit: 10 }),
  });
  const effectiveDate = dateParam ?? dates?.[0];

  // Both filters are independent and sticky — changing one never clears
  // the other (see the DateStrip comment above for why).
  function selectDate(date: string) {
    const next = new URLSearchParams(searchParams);
    next.set("date", date);
    setSearchParams(next);
  }

  function selectCategory(key: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (key) next.set("category", key);
    else next.delete("category");
    setSearchParams(next);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["current-affairs", "all", category, effectiveDate],
    queryFn: () => listCurrentAffairs({ category, date: effectiveDate }),
    enabled: Boolean(dateParam) || datesFetched,
  });

  return (
    <div className="max-w-[1140px] mx-auto px-6 py-6">
      <h1 className="font-heading text-2xl text-ink">{t("currentAffairsTitle")}</h1>
      <p className="text-sm text-ink-soft mt-1">{t("currentAffairsSubtitle")}</p>

      <div className="flex flex-wrap gap-2 mt-5">
        <button
          onClick={() => selectCategory(undefined)}
          className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", !category ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
        >
          {t("filterAll")}
        </button>
        {primaryCategories.map((c) => (
          <button
            key={c.id}
            onClick={() => selectCategory(c.key)}
            className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", category === c.key ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
          >
            {categoryLabel(c)}
          </button>
        ))}
        {secondaryCategories.length > 0 && (
          <button
            onClick={() => setShowMore((v) => !v)}
            className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-white border border-ink/[0.06] text-ink-soft"
          >
            {showMore ? "Less ▴" : "More ▾"}
          </button>
        )}
      </div>

      {showMore && secondaryCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {secondaryCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCategory(c.key)}
              className={cn("px-3.5 py-1.5 rounded-lg text-sm font-semibold", category === c.key ? "bg-primary text-white" : "bg-white border border-ink/[0.06] text-ink-soft")}
            >
              {categoryLabel(c)}
            </button>
          ))}
        </div>
      )}

      {dates && dates.length > 0 && (
        <DateStrip dates={dates} selectedDate={effectiveDate} onSelect={selectDate} lang={lang} t={t} />
      )}

      <div className="mt-6">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : !data?.data.length ? (
          dateParam ? (
            <EmptyState title={t("noCurrentAffairsForDate")} description={t("noCurrentAffairsForDateDesc")} />
          ) : (
            <EmptyState title={t("noCurrentAffairsFound")} description={t("tryDifferentCategory")} />
          )
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {data.data.map((ca) => <CurrentAffairCard key={ca.id} currentAffair={ca} />)}
          </div>
        )}
      </div>
    </div>
  );
}
