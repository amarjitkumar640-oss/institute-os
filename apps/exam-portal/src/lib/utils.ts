import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined, lang: "en" | "hi" = "en"): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Compact "28 Aug" form — no year, for date-strip chips where space is tight. */
export function formatShortDate(date: string | Date, lang: "en" | "hi" = "en"): string {
  return new Date(date).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short" });
}

/** Today's date as YYYY-MM-DD (UTC) — matches how current-affairs dates are keyed server-side. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
