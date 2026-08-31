import type { CurrentAffairCategoryPriority, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { bumpGovExamsDataVersion } from "./gov-exams.service";

export async function listAllCategories() {
  return prisma.currentAffairCategory.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function listVisibleCategories() {
  return prisma.currentAffairCategory.findMany({
    where: { isVisible: true },
    orderBy: { sortOrder: "asc" },
  });
}

// Fallback category for the scraper when AI extraction can't determine one.
// Exactly one row should have isDefault = true (enforced below); if that
// invariant is ever violated, fall back to the first visible category
// rather than throwing, so a scrape run never hard-fails on this alone.
export async function getDefaultCategory() {
  const byFlag = await prisma.currentAffairCategory.findFirst({ where: { isDefault: true } });
  if (byFlag) return byFlag;
  return prisma.currentAffairCategory.findFirst({ where: { isVisible: true }, orderBy: { sortOrder: "asc" } });
}

export interface CurrentAffairCategoryInput {
  key: string;
  labelEn: string;
  labelHi: string;
  shortLabelEn: string;
  shortLabelHi: string;
  priority?: CurrentAffairCategoryPriority;
  isVisible?: boolean;
  isDefault?: boolean;
}

export type CreateCategoryResult =
  | { ok: true; category: Prisma.CurrentAffairCategoryGetPayload<object> }
  | { ok: false; conflict: true };

export async function createCategory(data: CurrentAffairCategoryInput): Promise<CreateCategoryResult> {
  const clash = await prisma.currentAffairCategory.findUnique({ where: { key: data.key } });
  if (clash) return { ok: false, conflict: true };

  const maxOrder = await prisma.currentAffairCategory.aggregate({ _max: { sortOrder: true } });
  const nextOrder = (maxOrder._max.sortOrder ?? 0) + 1;

  const category = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.currentAffairCategory.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    return tx.currentAffairCategory.create({ data: { ...data, sortOrder: nextOrder } });
  });
  await bumpGovExamsDataVersion();
  return { ok: true, category };
}

export type UpdateCategoryResult =
  | { ok: true; category: Prisma.CurrentAffairCategoryGetPayload<object> }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true };

export async function updateCategory(
  id: string,
  data: Partial<CurrentAffairCategoryInput>,
): Promise<UpdateCategoryResult> {
  const existing = await prisma.currentAffairCategory.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  if (data.key !== undefined && data.key !== existing.key) {
    const clash = await prisma.currentAffairCategory.findUnique({ where: { key: data.key } });
    if (clash) return { ok: false, conflict: true };
  }

  const category = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.currentAffairCategory.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const updated = await tx.currentAffairCategory.update({ where: { id }, data });

    // Hiding the current default (or turning isDefault off with nothing
    // else picked) leaves the scraper with no fallback — auto-promote the
    // first remaining visible category so that invariant never breaks.
    if ((data.isVisible === false || data.isDefault === false) && existing.isDefault) {
      const stillDefault = await tx.currentAffairCategory.findFirst({ where: { isDefault: true } });
      if (!stillDefault) {
        const replacement = await tx.currentAffairCategory.findFirst({
          where: { isVisible: true, id: { not: id } },
          orderBy: { sortOrder: "asc" },
        });
        if (replacement) {
          await tx.currentAffairCategory.update({ where: { id: replacement.id }, data: { isDefault: true } });
        }
      }
    }

    return updated;
  });
  await bumpGovExamsDataVersion();
  return { ok: true, category };
}

export async function reorderCategories(ids: string[]): Promise<{ ok: true } | { ok: false; notFound: true }> {
  const existing = await prisma.currentAffairCategory.findMany({ where: { id: { in: ids } } });
  if (existing.length !== ids.length) return { ok: false, notFound: true };

  await prisma.$transaction(ids.map((id, index) =>
    prisma.currentAffairCategory.update({ where: { id }, data: { sortOrder: index + 1 } }),
  ));
  await bumpGovExamsDataVersion();
  return { ok: true };
}

export async function deleteCategory(
  id: string,
): Promise<{ ok: true } | { ok: false; notFound: true } | { ok: false; hasData: true; articleCount: number }> {
  const existing = await prisma.currentAffairCategory.findUnique({
    where: { id },
    include: { _count: { select: { currentAffairs: true } } },
  });
  if (!existing) return { ok: false, notFound: true };
  if (existing._count.currentAffairs > 0) {
    return { ok: false, hasData: true, articleCount: existing._count.currentAffairs };
  }

  await prisma.currentAffairCategory.delete({ where: { id } });

  if (existing.isDefault) {
    const replacement = await prisma.currentAffairCategory.findFirst({
      where: { isVisible: true },
      orderBy: { sortOrder: "asc" },
    });
    if (replacement) {
      await prisma.currentAffairCategory.update({ where: { id: replacement.id }, data: { isDefault: true } });
    }
  }

  await bumpGovExamsDataVersion();
  return { ok: true };
}
