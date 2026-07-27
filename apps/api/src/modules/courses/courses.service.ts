import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  CreateCourseInput,
  UpdateCourseInput,
} from "@institute-os/shared";
import { courseQuerySchema } from "@institute-os/shared";
import { z } from "zod";

type CourseQuery = z.infer<typeof courseQuerySchema>;

const CATEGORY_INCLUDE = { examCategories: { include: { examCategory: true } } } as const;

type WithCategoryLinks = { examCategories: { examCategory: unknown }[] };

// Prisma Decimal → number, and flatten the join-table rows into a plain examCategories array
function serializeCourse<T extends { defaultFee: Prisma.Decimal } & WithCategoryLinks>(
  course: T
): Omit<T, "defaultFee" | "examCategories"> & { defaultFee: number; examCategories: unknown[] } {
  const { defaultFee, examCategories, ...rest } = course;
  return { ...rest, defaultFee: Number(defaultFee), examCategories: examCategories.map((ec) => ec.examCategory) };
}

export async function listCourses(query: CourseQuery, tenantId: string) {
  const { examCategoryId, search, page, limit } = query;

  const where: Prisma.CourseWhereInput = { tenantId };
  if (examCategoryId) where.examCategories = { some: { examCategoryId } };
  if (search)         where.name = { contains: search, mode: "insensitive" };

  const [total, rows] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      include: {
        ...CATEGORY_INCLUDE,
        _count: { select: { batches: true } },
        batches: { select: { status: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const data = rows.map(({ batches, ...course }) => ({
    ...serializeCourse(course),
    batchCount:   batches.length,
    activeBatches: batches.filter((b) => b.status === "running").length,
  }));

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getCourse(id: string, tenantId: string) {
  const course = await prisma.course.findFirst({
    where: { id, tenantId },
    include: { ...CATEGORY_INCLUDE, batches: { select: { status: true } } },
  });
  if (!course) return null;

  const stats = course.batches.reduce(
    (acc, b) => { acc[b.status] = (acc[b.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const { batches, ...base } = course;
  return {
    ...serializeCourse(base),
    stats: {
      totalBatches:     batches.length,
      activeBatches:    stats["running"]   ?? 0,
      upcomingBatches:  stats["upcoming"]  ?? 0,
      completedBatches: stats["completed"] ?? 0,
    },
  };
}

export type CreateResult =
  | { ok: true; course: ReturnType<typeof serializeCourse> }
  | { ok: false; conflict: true };

export async function createCourse(data: CreateCourseInput, tenantId: string): Promise<CreateResult> {
  const clash = await prisma.course.findFirst({
    where: { tenantId, name: { equals: data.name, mode: "insensitive" } },
  });
  if (clash) return { ok: false, conflict: true };

  const { examCategoryIds, ...rest } = data;
  const course = await prisma.course.create({
    data: {
      ...rest,
      tenantId,
      examCategories: examCategoryIds.length
        ? { create: examCategoryIds.map((examCategoryId) => ({ examCategoryId })) }
        : undefined,
    },
    include: CATEGORY_INCLUDE,
  });
  return { ok: true, course: serializeCourse(course) };
}

export type UpdateResult =
  | { ok: true; course: ReturnType<typeof serializeCourse> }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true };

export async function updateCourse(
  id: string,
  tenantId: string,
  data: UpdateCourseInput
): Promise<UpdateResult> {
  const existing = await prisma.course.findFirst({ where: { id, tenantId } });
  if (!existing) return { ok: false, notFound: true };

  // Only check name uniqueness when the name is being changed
  if (data.name !== undefined && data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await prisma.course.findFirst({
      where: { tenantId, name: { equals: data.name, mode: "insensitive" }, NOT: { id } },
    });
    if (clash) return { ok: false, conflict: true };
  }

  const { examCategoryIds, ...scalarFields } = data;

  const course = await prisma.$transaction(async (tx) => {
    if (examCategoryIds !== undefined) {
      // Full replace: delete all then re-insert, same pattern as Faculty's subjectIds
      await tx.courseExamCategory.deleteMany({ where: { courseId: id } });
      if (examCategoryIds.length) {
        await tx.courseExamCategory.createMany({
          data: examCategoryIds.map((examCategoryId) => ({ courseId: id, examCategoryId })),
        });
      }
    }

    return tx.course.update({ where: { id }, data: scalarFields, include: CATEGORY_INCLUDE });
  });

  return { ok: true, course: serializeCourse(course) };
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; notFound: true }
  | { ok: false; hasData: true; batchCount: number };

export async function deleteCourse(id: string, tenantId: string): Promise<DeleteResult> {
  const course = await prisma.course.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { batches: true } } },
  });
  if (!course) return { ok: false, notFound: true };

  if (course._count.batches > 0) {
    return { ok: false, hasData: true, batchCount: course._count.batches };
  }

  await prisma.courseFeeTemplate.deleteMany({ where: { courseId: id } });
  await prisma.course.delete({ where: { id } });
  return { ok: true };
}
