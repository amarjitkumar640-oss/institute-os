import { PrismaClient } from "@prisma/client";
import { runClassReminderSweep, runOverdueInstallmentSweep } from "../notifications/sweep";
import { runBatchStatusSweep } from "../batches/batchStatus.sweep";

export type JobTrigger = "scheduler" | "manual";

// Free-form counts, stored verbatim as JobRun.resultSummary — e.g.
// { notifiedCount } or { startedCount, completedCount }.
export interface JobResult {
  [key: string]: number | string;
}

export interface JobDefinition {
  key: string;
  label: string;
  description: string;
  defaultIntervalMinutes: number;
  run: (db: PrismaClient) => Promise<JobResult>;
}

// The source of truth for which jobs exist — label/description/handler/default
// interval live here in code (mirrors DEFAULT_ROUTING as the code-side fallback
// for NotificationRoutingRule); only the admin-editable interval/enabled flag
// and the run history live in the DB (JobConfig/JobRun).
export const JOB_REGISTRY: JobDefinition[] = [
  {
    key: "class-reminder-sweep",
    label: "Class Reminder Sweep",
    description: "Notifies teachers of sessions starting within each tenant's reminder window.",
    defaultIntervalMinutes: 1,
    run: runClassReminderSweep,
  },
  {
    key: "overdue-installment-sweep",
    label: "Overdue Installment Sweep",
    description: "Notifies configured roles about installments overdue past each tenant's grace period.",
    defaultIntervalMinutes: 1,
    run: runOverdueInstallmentSweep,
  },
  {
    key: "batch-status-sweep",
    label: "Batch Status Sync",
    description: "Promotes batches upcoming → running → completed based on start/end dates.",
    defaultIntervalMinutes: 60,
    run: runBatchStatusSweep,
  },
];

export function getJobDefinition(key: string): JobDefinition | undefined {
  return JOB_REGISTRY.find((j) => j.key === key);
}

// Idempotent upsert-if-missing — called before anything reads/writes a job's
// config, so JobConfig always has a row without needing a seed script.
export async function ensureJobConfig(db: PrismaClient, def: JobDefinition) {
  return db.jobConfig.upsert({
    where: { key: def.key },
    update: {},
    create: { key: def.key, intervalMinutes: def.defaultIntervalMinutes, isEnabled: true },
  });
}
