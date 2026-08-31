import type { PrismaClient } from "@prisma/client";
import { isScheduleDue, type ScheduleConfig } from "../../lib/schedule";
import {
  runSourceAndRecordStatus,
  runJobVacancyPromptTemplateAndRecordStatus,
  runCurrentAffairsPromptTemplateAndRecordStatus,
} from "./gov-sources.service";

// Independent per-row scheduling for gov-exams sources/prompt templates —
// deliberately separate from modules/jobs/scheduler.ts, which schedules a
// fixed, code-defined set of job *types* (JOB_REGISTRY), each with exactly
// one JobConfig row. GovSource/GovJobVacancyPromptTemplate/
// GovCurrentAffairsPromptTemplate are admin-managed rows (a variable number
// of sources, one row per category, one singleton) that already carry
// their own last-run/status fields — this tick checks each row against its
// own scheduleFrequency/scheduleTimeOfDay/etc. (lib/schedule.ts) rather
// than a shared interval, and the "already running" guards live in the
// run...AndRecordStatus functions themselves (gov-sources.service.ts), not
// here, so a scheduler-fired run and a manual Run Now click can't race.
const POLL_INTERVAL_MS = 30_000;

// Exported (unlike modules/jobs/scheduler.ts's private tick()) so tests can
// exercise the enabled-filter + due-check + field-mapping wiring directly —
// this glue is new and non-trivial enough to be worth catching bugs in,
// even though the run...AndRecordStatus functions it calls are tested
// separately.
export async function tick(db: PrismaClient) {
  const now = new Date();

  const sources = await db.govSource.findMany({ where: { enabled: true } });
  for (const source of sources) {
    const config: ScheduleConfig = {
      frequency: source.scheduleFrequency,
      timeOfDay: source.scheduleTimeOfDay,
      dayOfWeek: source.scheduleDayOfWeek,
      dayOfMonth: source.scheduleDayOfMonth,
    };
    if (isScheduleDue(config, source.lastScrapedAt, now)) {
      runSourceAndRecordStatus(source).catch((err) => console.error(`[gov-exams-scheduler] source ${source.id} failed:`, err));
    }
  }

  const jobVacancyTemplates = await db.govJobVacancyPromptTemplate.findMany({ where: { enabled: true } });
  for (const template of jobVacancyTemplates) {
    const config: ScheduleConfig = {
      frequency: template.scheduleFrequency,
      timeOfDay: template.scheduleTimeOfDay,
      dayOfWeek: template.scheduleDayOfWeek,
      dayOfMonth: template.scheduleDayOfMonth,
    };
    if (isScheduleDue(config, template.lastRunAt, now)) {
      runJobVacancyPromptTemplateAndRecordStatus(template).catch((err) =>
        console.error(`[gov-exams-scheduler] job-vacancy prompt ${template.category} failed:`, err),
      );
    }
  }

  const currentAffairsTemplate = await db.govCurrentAffairsPromptTemplate.findFirst({ where: { id: "singleton", enabled: true } });
  if (currentAffairsTemplate) {
    const config: ScheduleConfig = {
      frequency: currentAffairsTemplate.scheduleFrequency,
      timeOfDay: currentAffairsTemplate.scheduleTimeOfDay,
      dayOfWeek: currentAffairsTemplate.scheduleDayOfWeek,
      dayOfMonth: currentAffairsTemplate.scheduleDayOfMonth,
    };
    if (isScheduleDue(config, currentAffairsTemplate.lastRunAt, now)) {
      runCurrentAffairsPromptTemplateAndRecordStatus(currentAffairsTemplate).catch((err) =>
        console.error("[gov-exams-scheduler] current-affairs prompt failed:", err),
      );
    }
  }
}

export function startGovExamsScheduler(db: PrismaClient) {
  tick(db).catch((err) => console.error("[gov-exams-scheduler] tick error:", err));
  setInterval(() => tick(db).catch((err) => console.error("[gov-exams-scheduler] tick error:", err)), POLL_INTERVAL_MS);
}
