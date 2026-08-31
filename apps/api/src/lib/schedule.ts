// Real clock-time scheduling (daily/weekly/monthly at a specific time of
// day) for gov-exams sources and search-prompt templates — see
// gov-exams-scheduler.ts. Deliberately deviates from this codebase's usual
// "treat dates as UTC, timezone-agnostic" convention (schedule.service.ts):
// an admin configuring "run at 9 AM" means 9 AM their own clock (India),
// not 9 AM UTC. India has no DST, so this is a fixed +5:30 offset, not
// real timezone-library complexity.

export type GovScheduleFrequency = "hourly" | "daily" | "weekly" | "monthly";

export interface ScheduleConfig {
  frequency: GovScheduleFrequency;
  /** "HH:MM", IST wall-clock. Unused for "hourly"; required for the rest. */
  timeOfDay: string | null;
  /** 0=Sunday..6=Saturday. Required for "weekly" only. */
  dayOfWeek: number | null;
  /** 1-31, clamped to the real last day of shorter months. Required for "monthly" only. */
  dayOfMonth: number | null;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

interface IstParts {
  year: number;
  month: number; // 0-11
  day: number;
  weekday: number; // 0=Sun..6=Sat
}

/** IST wall-clock calendar fields for a given instant. */
function toIstParts(date: Date): IstParts {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth(), day: ist.getUTCDate(), weekday: ist.getUTCDay() };
}

// JS's Date.UTC normalizes an out-of-range day (0, negative, or beyond the
// month's length) by rolling into the adjacent month/year — used below so
// "7 days before this IST calendar day" and "previous month, same day"
// work correctly across month/year boundaries without special-casing.
function fromIstDateAndTime(year: number, month: number, day: number, hh: number, mm: number): Date {
  const istMs = Date.UTC(year, month, day, hh, mm, 0, 0);
  return new Date(istMs - IST_OFFSET_MS);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function parseTimeOfDay(timeOfDay: string | null): { hh: number; mm: number } {
  const [hh, mm] = (timeOfDay ?? "00:00").split(":").map(Number);
  return { hh, mm };
}

/**
 * The most recent instant at or before `now` that `config` should have
 * fired. Compared against a row's lastRunAt to decide if it's due — see
 * isScheduleDue().
 */
export function mostRecentScheduledFireTime(config: ScheduleConfig, now: Date): Date {
  if (config.frequency === "hourly") {
    const d = new Date(now);
    d.setUTCMinutes(0, 0, 0);
    return d;
  }

  const { hh, mm } = parseTimeOfDay(config.timeOfDay);
  const nowIst = toIstParts(now);

  if (config.frequency === "daily") {
    const today = fromIstDateAndTime(nowIst.year, nowIst.month, nowIst.day, hh, mm);
    return today.getTime() <= now.getTime() ? today : fromIstDateAndTime(nowIst.year, nowIst.month, nowIst.day - 1, hh, mm);
  }

  if (config.frequency === "weekly") {
    const targetWeekday = config.dayOfWeek ?? 0;
    const daysSinceTarget = (nowIst.weekday - targetWeekday + 7) % 7;
    const thisOccurrence = fromIstDateAndTime(nowIst.year, nowIst.month, nowIst.day - daysSinceTarget, hh, mm);
    return thisOccurrence.getTime() <= now.getTime()
      ? thisOccurrence
      : fromIstDateAndTime(nowIst.year, nowIst.month, nowIst.day - daysSinceTarget - 7, hh, mm);
  }

  // monthly
  const targetDom = config.dayOfMonth ?? 1;
  const clampedThisMonth = Math.min(targetDom, daysInMonth(nowIst.year, nowIst.month));
  const thisOccurrence = fromIstDateAndTime(nowIst.year, nowIst.month, clampedThisMonth, hh, mm);
  if (thisOccurrence.getTime() <= now.getTime()) return thisOccurrence;

  const prevMonthIndex = nowIst.month - 1; // may be -1; Date.UTC normalizes month overflow/underflow too
  const prevMonthYear = prevMonthIndex < 0 ? nowIst.year - 1 : nowIst.year;
  const prevMonthNormalized = (prevMonthIndex + 12) % 12;
  const clampedPrevMonth = Math.min(targetDom, daysInMonth(prevMonthYear, prevMonthNormalized));
  return fromIstDateAndTime(prevMonthYear, prevMonthNormalized, clampedPrevMonth, hh, mm);
}

export function isScheduleDue(config: ScheduleConfig, lastRunAt: Date | null, now: Date): boolean {
  if (!lastRunAt) return true;
  return lastRunAt.getTime() < mostRecentScheduledFireTime(config, now).getTime();
}

// Cross-field conditional validation — can't be expressed cleanly as a flat
// zod object, same reasoning as gov-sources.service.ts's
// validateFetchModeFields. Shared by GovSource, GovJobVacancyPromptTemplate,
// and GovCurrentAffairsPromptTemplate's create/update paths.
export function validateScheduleFields(config: Partial<ScheduleConfig> & { frequency: GovScheduleFrequency }): string | null {
  if (config.frequency !== "hourly") {
    if (!config.timeOfDay) return "A time of day is required for daily, weekly, and monthly schedules";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.timeOfDay)) return "Time of day must be in HH:MM (24-hour) format";
  }
  if (config.frequency === "weekly") {
    if (config.dayOfWeek == null) return "A day of week is required for weekly schedules";
    if (config.dayOfWeek < 0 || config.dayOfWeek > 6) return "Day of week must be between 0 (Sunday) and 6 (Saturday)";
  }
  if (config.frequency === "monthly") {
    if (config.dayOfMonth == null) return "A day of month is required for monthly schedules";
    if (config.dayOfMonth < 1 || config.dayOfMonth > 31) return "Day of month must be between 1 and 31";
  }
  return null;
}
