import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type {
  CreateCourseInput,
  UpdateCourseInput,
} from "@institute-os/shared";
import { courseQuerySchema } from "@institute-os/shared";
import { z } from "zod";

type CourseQuery = z.infer<typeof courseQuerySchema>;

// Prisma Decimal → number so JSON output is always a plain number
function serializeCourse<T extends { defaultFee: Prisma.Decimal }>(
  course: T
): Omit<T, "defaultFee"> & { defaultFee: number } {
  const { defaultFee, ...rest } = course;
  return { ...rest, defaultFee: Number(defaultFee) };
}

export async function listCourses(query: CourseQuery) {
  const { examCategory, search, page, limit } = query;

  const where: Prisma.CourseWhereInput = {};
  if (examCategory) where.examCategory = examCategory;
  if (search)       where.name = { contains: search, mode: "insensitive" };

  const [total, rows] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      include: {
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

export async function getCourse(id: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: { batches: { select: { status: true } } },
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

export async function createCourse(data: CreateCourseInput): Promise<CreateResult> {
  const clash = await prisma.course.findFirst({
    where: {
      name:         { equals: data.name, mode: "insensitive" },
      examCategory: data.examCategory,
    },
  });
  if (clash) return { ok: false, conflict: true };

  const course = await prisma.course.create({ data });
  return { ok: true, course: serializeCourse(course) };
}

export type UpdateResult =
  | { ok: true; course: ReturnType<typeof serializeCourse> }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true };

export async function updateCourse(
  id: string,
  data: UpdateCourseInput
): Promise<UpdateResult> {
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) return { ok: false, notFound: true };

  // Only check name uniqueness when name or category is being changed
  if (data.name !== undefined || data.examCategory !== undefined) {
    const nameToCheck     = data.name         ?? existing.name;
    const categoryToCheck = data.examCategory ?? existing.examCategory;
    const clash = await prisma.course.findFirst({
      where: {
        name:         { equals: nameToCheck, mode: "insensitive" },
        examCategory: categoryToCheck,
        NOT:          { id },
      },
    });
    if (clash) return { ok: false, conflict: true };
  }

  const course = await prisma.course.update({ where: { id }, data });
  return { ok: true, course: serializeCourse(course) };
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; notFound: true }
  | { ok: false; hasData: true; batchCount: number };

export async function deleteCourse(id: string): Promise<DeleteResult> {
  const course = await prisma.course.findUnique({
    where: { id },
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
