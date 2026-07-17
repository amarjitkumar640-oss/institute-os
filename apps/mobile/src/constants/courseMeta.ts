import type { CoursePreference } from "../api/students";

export const COURSE_META: Record<CoursePreference, { label: string; color: string }> = {
  ssc:        { label: "SSC",        color: "#2563A8" },
  banking:    { label: "Banking",    color: "#1B9C63" },
  railway:    { label: "Railway",    color: "#E8752C" },
  foundation: { label: "Foundation", color: "#7C3AED" },
  others:     { label: "Others",     color: "#8A7F82" },
};

export const CAT_COLOR: Record<string, string> = {
  ssc:     "#8B1E3F",
  banking: "#2563A8",
  railway: "#2CA6A4",
  shared:  "#E8752C",
};

export const CAT_LABEL: Record<string, string> = {
  ssc:     "SSC",
  banking: "Banking",
  railway: "Railway",
  shared:  "Shared",
};

export const EXAM_COLOR: Record<string, string> = {
  ssc:     COURSE_META.ssc.color,
  banking: COURSE_META.banking.color,
  railway: COURSE_META.railway.color,
};

export const EXAM_LABEL: Record<string, string> = {
  ssc:     COURSE_META.ssc.label,
  banking: COURSE_META.banking.label,
  railway: COURSE_META.railway.label,
};

export function getCourseMeta(coursePreference: string | null | undefined): { label: string; color: string } {
  return (coursePreference ? COURSE_META[coursePreference as CoursePreference] : null) ?? { label: "—", color: "#8A7F82" };
}
