import type { GovOrgType, GovScheduleFrequency } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { validateScheduleFields } from "../../lib/schedule";
import { runJobVacancyPromptTemplateAndRecordStatus, runCurrentAffairsPromptTemplateAndRecordStatus } from "./gov-sources.service";

const CURRENT_AFFAIRS_SINGLETON_ID = "singleton";

export interface PromptTemplateInput {
  prompt: string;
  enabled?: boolean;
  scheduleFrequency?: GovScheduleFrequency;
  scheduleTimeOfDay?: string;
  scheduleDayOfWeek?: number;
  scheduleDayOfMonth?: number;
}

export type UpsertPromptTemplateResult<T> = { ok: true; template: T } | { ok: false; invalid: string };

export function listJobVacancyPromptTemplates() {
  return prisma.govJobVacancyPromptTemplate.findMany({ orderBy: { category: "asc" } });
}

export function getJobVacancyPromptTemplate(category: GovOrgType) {
  return prisma.govJobVacancyPromptTemplate.findUnique({ where: { category } });
}

export async function upsertJobVacancyPromptTemplate(category: GovOrgType, data: PromptTemplateInput) {
  const existing = await prisma.govJobVacancyPromptTemplate.findUnique({ where: { category } });
  const invalid = validateScheduleFields({
    frequency: data.scheduleFrequency ?? existing?.scheduleFrequency ?? "hourly",
    timeOfDay: data.scheduleTimeOfDay ?? existing?.scheduleTimeOfDay ?? null,
    dayOfWeek: data.scheduleDayOfWeek ?? existing?.scheduleDayOfWeek ?? null,
    dayOfMonth: data.scheduleDayOfMonth ?? existing?.scheduleDayOfMonth ?? null,
  });
  if (invalid) return { ok: false, invalid } as const;

  const template = await prisma.govJobVacancyPromptTemplate.upsert({
    where: { category },
    create: {
      category,
      prompt: data.prompt,
      enabled: data.enabled ?? true,
      scheduleFrequency: data.scheduleFrequency,
      scheduleTimeOfDay: data.scheduleTimeOfDay,
      scheduleDayOfWeek: data.scheduleDayOfWeek,
      scheduleDayOfMonth: data.scheduleDayOfMonth,
    },
    update: {
      prompt: data.prompt,
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.scheduleFrequency !== undefined ? { scheduleFrequency: data.scheduleFrequency } : {}),
      ...(data.scheduleTimeOfDay !== undefined ? { scheduleTimeOfDay: data.scheduleTimeOfDay } : {}),
      ...(data.scheduleDayOfWeek !== undefined ? { scheduleDayOfWeek: data.scheduleDayOfWeek } : {}),
      ...(data.scheduleDayOfMonth !== undefined ? { scheduleDayOfMonth: data.scheduleDayOfMonth } : {}),
    },
  });
  return { ok: true, template } as const;
}

// Deletes the row entirely — returns the category to "not configured yet"
// (the scheduler simply won't find a row for it, same as before it was
// ever saved) rather than leaving an empty-prompt row around that would
// still fire on its schedule and waste an AI Gateway call on nothing.
export async function deleteJobVacancyPromptTemplate(category: GovOrgType): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.govJobVacancyPromptTemplate.findUnique({ where: { category } });
  if (!existing) return { ok: false, notFound: true };
  await prisma.govJobVacancyPromptTemplate.delete({ where: { category } });
  return { ok: true };
}

export type RunJobVacancyPromptTemplateResult =
  | { ok: true; result: Awaited<ReturnType<typeof runJobVacancyPromptTemplateAndRecordStatus>> }
  | { ok: false; notFound: true };

export async function runJobVacancyPromptTemplateNow(
  category: GovOrgType,
  options?: { useCachedSearch?: boolean },
): Promise<RunJobVacancyPromptTemplateResult> {
  const template = await prisma.govJobVacancyPromptTemplate.findUnique({ where: { category } });
  if (!template) return { ok: false, notFound: true };
  const result = await runJobVacancyPromptTemplateAndRecordStatus(template, options);
  return { ok: true, result };
}

export function getCurrentAffairsPromptTemplate() {
  return prisma.govCurrentAffairsPromptTemplate.findUnique({ where: { id: CURRENT_AFFAIRS_SINGLETON_ID } });
}

export async function upsertCurrentAffairsPromptTemplate(data: PromptTemplateInput) {
  const existing = await prisma.govCurrentAffairsPromptTemplate.findUnique({ where: { id: CURRENT_AFFAIRS_SINGLETON_ID } });
  const invalid = validateScheduleFields({
    frequency: data.scheduleFrequency ?? existing?.scheduleFrequency ?? "daily",
    timeOfDay: data.scheduleTimeOfDay ?? existing?.scheduleTimeOfDay ?? "06:00",
    dayOfWeek: data.scheduleDayOfWeek ?? existing?.scheduleDayOfWeek ?? null,
    dayOfMonth: data.scheduleDayOfMonth ?? existing?.scheduleDayOfMonth ?? null,
  });
  if (invalid) return { ok: false, invalid } as const;

  const template = await prisma.govCurrentAffairsPromptTemplate.upsert({
    where: { id: CURRENT_AFFAIRS_SINGLETON_ID },
    create: {
      id: CURRENT_AFFAIRS_SINGLETON_ID,
      prompt: data.prompt,
      enabled: data.enabled ?? true,
      scheduleFrequency: data.scheduleFrequency,
      scheduleTimeOfDay: data.scheduleTimeOfDay,
      scheduleDayOfWeek: data.scheduleDayOfWeek,
      scheduleDayOfMonth: data.scheduleDayOfMonth,
    },
    update: {
      prompt: data.prompt,
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.scheduleFrequency !== undefined ? { scheduleFrequency: data.scheduleFrequency } : {}),
      ...(data.scheduleTimeOfDay !== undefined ? { scheduleTimeOfDay: data.scheduleTimeOfDay } : {}),
      ...(data.scheduleDayOfWeek !== undefined ? { scheduleDayOfWeek: data.scheduleDayOfWeek } : {}),
      ...(data.scheduleDayOfMonth !== undefined ? { scheduleDayOfMonth: data.scheduleDayOfMonth } : {}),
    },
  });
  return { ok: true, template } as const;
}

export async function deleteCurrentAffairsPromptTemplate(): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.govCurrentAffairsPromptTemplate.findUnique({ where: { id: CURRENT_AFFAIRS_SINGLETON_ID } });
  if (!existing) return { ok: false, notFound: true };
  await prisma.govCurrentAffairsPromptTemplate.delete({ where: { id: CURRENT_AFFAIRS_SINGLETON_ID } });
  return { ok: true };
}

export async function runCurrentAffairsPromptTemplateNow(options?: { useCachedSearch?: boolean }) {
  const template = await prisma.govCurrentAffairsPromptTemplate.findUnique({ where: { id: CURRENT_AFFAIRS_SINGLETON_ID } });
  if (!template) return { ok: false, notFound: true } as const;
  const result = await runCurrentAffairsPromptTemplateAndRecordStatus(template, options);
  return { ok: true, result } as const;
}
