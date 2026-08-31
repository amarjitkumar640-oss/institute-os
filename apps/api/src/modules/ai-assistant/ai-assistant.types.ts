// Which feature a session belongs to — a plain TS union, not a DB enum, so
// a new surface never needs a migration (same reasoning as JobRun.trigger).
export type AssistantSurface = "gov_exams_admin";
