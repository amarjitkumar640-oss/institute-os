import type { CoursePreference } from "../api/students";

export const COURSE_META: Record<CoursePreference, { label: string; color: string }> = {
  ssc:        { label: "SSC",        color: "#2563A8" },
  banking:    { label: "Banking",    color: "#1B9C63" },
  railway:    { label: "Railway",    color: "#E8752C" },
  foundation: { label: "Foundation", color: "#7C3AED" },
  others:     { label: "Others",     color: "#8A7F82" },
};

export function getCourseMeta(coursePreference: string | null | undefined): { label: string; color: string } {
  return (coursePreference ? COURSE_META[coursePreference as CoursePreference] : null) ?? { label: "—", color: "#8A7F82" };
}
