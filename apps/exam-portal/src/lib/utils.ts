import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined, lang: "en" | "hi" = "en"): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
