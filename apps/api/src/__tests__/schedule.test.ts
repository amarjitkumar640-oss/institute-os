import { isScheduleDue, mostRecentScheduledFireTime, type ScheduleConfig } from "../lib/schedule";

// All "now" instants below are UTC; comments give the equivalent IST
// (UTC+5:30) wall-clock time for clarity, since that's what the schedule
// config's timeOfDay/dayOfWeek/dayOfMonth are expressed in.

describe("mostRecentScheduledFireTime — hourly", () => {
  it("returns the top of the current UTC hour", () => {
    const now = new Date("2026-08-28T14:37:22.000Z");
    const config: ScheduleConfig = { frequency: "hourly", timeOfDay: null, dayOfWeek: null, dayOfMonth: null };
    expect(mostRecentScheduledFireTime(config, now).toISOString()).toBe("2026-08-28T14:00:00.000Z");
  });
});

describe("mostRecentScheduledFireTime — daily", () => {
  const config: ScheduleConfig = { frequency: "daily", timeOfDay: "09:00", dayOfWeek: null, dayOfMonth: null };

  it("uses today's scheduled time when it has already passed (IST)", () => {
    // 2026-08-28 15:00 IST — well after 09:00 IST today.
    const now = new Date("2026-08-28T09:30:00.000Z");
    expect(mostRecentScheduledFireTime(config, now).toISOString()).toBe("2026-08-28T03:30:00.000Z"); // 09:00 IST = 03:30 UTC
  });

  it("falls back to yesterday's scheduled time when today's hasn't happened yet (IST)", () => {
    // 2026-08-28 08:00 IST — before 09:00 IST today.
    const now = new Date("2026-08-28T02:30:00.000Z");
    expect(mostRecentScheduledFireTime(config, now).toISOString()).toBe("2026-08-27T03:30:00.000Z");
  });
});

describe("mostRecentScheduledFireTime — weekly", () => {
  // Friday (5) at 18:00 IST.
  const config: ScheduleConfig = { frequency: "weekly", timeOfDay: "18:00", dayOfWeek: 5, dayOfMonth: null };

  it("finds this week's occurrence when it has already passed", () => {
    // Saturday 2026-08-29 in IST (>= Friday 18:00 IST).
    const now = new Date("2026-08-29T04:00:00.000Z"); // Sat 09:30 IST
    const result = mostRecentScheduledFireTime(config, now);
    expect(result.toISOString()).toBe("2026-08-28T12:30:00.000Z"); // Fri 2026-08-28 18:00 IST
  });

  it("falls back to the previous week's occurrence, crossing a month boundary", () => {
    // 2026-09-01 (Tuesday IST) — before this week's Friday.
    const now = new Date("2026-09-01T04:00:00.000Z"); // Tue 09:30 IST
    const result = mostRecentScheduledFireTime(config, now);
    expect(result.toISOString()).toBe("2026-08-28T12:30:00.000Z"); // preceding Friday, in August
  });
});

describe("mostRecentScheduledFireTime — monthly", () => {
  it("clamps day 31 to the real last day of a shorter month (February, non-leap)", () => {
    const config: ScheduleConfig = { frequency: "monthly", timeOfDay: "10:00", dayOfWeek: null, dayOfMonth: 31 };
    // 2027-02-20 IST — after Feb 28 hasn't happened yet this month, so falls back to January 31.
    const now = new Date("2027-02-20T05:00:00.000Z"); // Feb 20 10:30 IST
    const result = mostRecentScheduledFireTime(config, now);
    expect(result.toISOString()).toBe("2027-01-31T04:30:00.000Z"); // Jan 31 2027 10:00 IST
  });

  it("uses this month's clamped occurrence once it has passed", () => {
    const config: ScheduleConfig = { frequency: "monthly", timeOfDay: "10:00", dayOfWeek: null, dayOfMonth: 31 };
    // 2027-03-01 IST — after February's clamped occurrence (Feb 28, 10:00 IST).
    const now = new Date("2027-03-01T05:00:00.000Z");
    const result = mostRecentScheduledFireTime(config, now);
    expect(result.toISOString()).toBe("2027-02-28T04:30:00.000Z"); // Feb 28 2027 10:00 IST (clamped)
  });

  it("crosses a year boundary correctly (configured for the 1st, evaluated in early January)", () => {
    const config: ScheduleConfig = { frequency: "monthly", timeOfDay: "06:00", dayOfWeek: null, dayOfMonth: 1 };
    // 2027-01-01 05:00 IST — before this month's 06:00 IST occurrence.
    const now = new Date("2026-12-31T23:30:00.000Z");
    const result = mostRecentScheduledFireTime(config, now);
    expect(result.toISOString()).toBe("2026-12-01T00:30:00.000Z"); // Dec 1 2026 06:00 IST
  });
});

describe("isScheduleDue", () => {
  const config: ScheduleConfig = { frequency: "daily", timeOfDay: "09:00", dayOfWeek: null, dayOfMonth: null };
  const now = new Date("2026-08-28T09:30:00.000Z"); // well after today's 09:00 IST (03:30 UTC)

  it("is due when never run before", () => {
    expect(isScheduleDue(config, null, now)).toBe(true);
  });

  it("is due when the last run was before today's scheduled fire time", () => {
    expect(isScheduleDue(config, new Date("2026-08-27T03:30:00.000Z"), now)).toBe(true);
  });

  it("is not due when the last run was at or after today's scheduled fire time", () => {
    expect(isScheduleDue(config, new Date("2026-08-28T03:30:00.000Z"), now)).toBe(false);
    expect(isScheduleDue(config, new Date("2026-08-28T05:00:00.000Z"), now)).toBe(false);
  });
});
