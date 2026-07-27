import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { CreateFacultyInput, UpdateFacultyInput } from "@institute-os/shared";
import { facultyQuerySchema } from "@institute-os/shared";
import { z } from "zod";

type FacultyQuery = z.infer<typeof facultyQuerySchema>;

// ─── Shape helpers ────────────────────────────────────────────────────────────

type ExamCategoryRef = { id: string; key: string; label: string; color: string };
type SubjectWithCategories = { id: string; name: string; examCategories: { examCategory: ExamCategoryRef }[] };

function serializeSubject(s: SubjectWithCategories) {
  return { id: s.id, name: s.name, examCategories: s.examCategories.map((ec) => ec.examCategory) };
}

function serializeFaculty<
  T extends {
    createdAt: Date;
    updatedAt: Date;
    joiningDate: Date;
    teachingSubjects: Array<{ subject: SubjectWithCategories }>;
  }
>(f: T) {
  const { teachingSubjects, ...rest } = f;
  return {
    ...rest,
    joiningDate: rest.joiningDate.toISOString().slice(0, 10),
    subjects: teachingSubjects.map((ts) => serializeSubject(ts.subject)),
  };
}

// ─── Auto employee-code ───────────────────────────────────────────────────────

async function nextEmployeeCode(tenantId: string): Promise<string> {
  const count = await prisma.faculty.count({ where: { tenantId } });
  return `FAC${String(count + 1).padStart(4, "0")}`;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listFaculty(query: FacultyQuery, tenantId: string, centerId?: string | null) {
  const { search, examCategoryId, isActive, page, limit } = query;

  const where: Prisma.FacultyWhereInput = { tenantId };
  if (centerId) where.centerId = centerId;

  if (isActive !== undefined) where.isActive = isActive;

  if (search) {
    where.OR = [
      { fullName:      { contains: search, mode: "insensitive" } },
      { email:         { contains: search, mode: "insensitive" } },
      { phone:         { contains: search } },
      { employeeCode:  { contains: search, mode: "insensitive" } },
      { qualification: { contains: search, mode: "insensitive" } },
    ];
  }

  // Filter by exam category — include faculty who teach subjects of that category OR shared (no-category) subjects
  if (examCategoryId) {
    where.teachingSubjects = {
      some: {
        subject: {
          OR: [
            { examCategories: { some: { examCategoryId } } },
            { examCategories: { none: {} } },
          ],
        },
      },
    };
  }

  const subjectInclude = {
    teachingSubjects: {
      include: { subject: { select: { id: true, name: true, examCategories: { include: { examCategory: true } } } } },
      orderBy: { subject: { name: "asc" as const } },
    },
  };

  const [total, rows] = await prisma.$transaction([
    prisma.faculty.count({ where }),
    prisma.faculty.findMany({
      where,
      include: subjectInclude,
      orderBy: { fullName: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: rows.map(serializeFaculty),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

// ─── Get one ─────────────────────────────────────────────────────────────────

export async function getFaculty(id: string, tenantId: string) {
  const f = await prisma.faculty.findFirst({
    where: { id, tenantId },
    include: {
      teachingSubjects: {
        include: { subject: { select: { id: true, name: true, examCategories: { include: { examCategory: true } } } } },
        orderBy: { subject: { name: "asc" } },
      },
    },
  });
  return f ? serializeFaculty(f) : null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export type CreateFacultyResult =
  | { ok: true; faculty: ReturnType<typeof serializeFaculty> }
  | { ok: false; emailConflict: true }
  | { ok: false; phoneConflict: true };

export async function createFaculty(data: CreateFacultyInput, tenantId: string, centerId?: string | null): Promise<CreateFacultyResult> {
  const [emailClash, phoneClash] = await prisma.$transaction([
    prisma.faculty.findUnique({ where: { tenantId_email: { tenantId, email: data.email } } }),
    prisma.faculty.findUnique({ where: { tenantId_phone: { tenantId, phone: data.phone } } }),
  ]);
  if (emailClash) return { ok: false, emailConflict: true };
  if (phoneClash) return { ok: false, phoneConflict: true };

  const employeeCode = await nextEmployeeCode(tenantId);
  const { subjectIds, joiningDate, ...rest } = data;

  const faculty = await prisma.faculty.create({
    data: {
      ...rest,
      tenantId,
      employeeCode,
      joiningDate: new Date(joiningDate),
      centerId:    centerId ?? undefined,
      teachingSubjects: subjectIds.length
        ? { create: subjectIds.map((sid) => ({ subjectId: sid })) }
        : undefined,
    },
    include: {
      teachingSubjects: {
        include: { subject: { select: { id: true, name: true, examCategories: { include: { examCategory: true } } } } },
        orderBy: { subject: { name: "asc" } },
      },
    },
  });

  return { ok: true, faculty: serializeFaculty(faculty) };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateFacultyResult =
  | { ok: true; faculty: ReturnType<typeof serializeFaculty> }
  | { ok: false; notFound: true }
  | { ok: false; emailConflict: true }
  | { ok: false; phoneConflict: true };

export async function updateFaculty(
  id: string,
  tenantId: string,
  data: UpdateFacultyInput
): Promise<UpdateFacultyResult> {
  const existing = await prisma.faculty.findFirst({ where: { id, tenantId } });
  if (!existing) return { ok: false, notFound: true };

  if (data.email && data.email !== existing.email) {
    const clash = await prisma.faculty.findUnique({ where: { tenantId_email: { tenantId, email: data.email } } });
    if (clash) return { ok: false, emailConflict: true };
  }
  if (data.phone && data.phone !== existing.phone) {
    const clash = await prisma.faculty.findUnique({ where: { tenantId_phone: { tenantId, phone: data.phone } } });
    if (clash) return { ok: false, phoneConflict: true };
  }

  const { subjectIds, joiningDate, ...scalarFields } = data;

  // Run scalar update (+ optional subject replace) in one transaction
  const faculty = await prisma.$transaction(async (tx) => {
    if (subjectIds !== undefined) {
      // Full replace: delete all then re-insert
      await tx.facultySubject.deleteMany({ where: { facultyId: id } });
      if (subjectIds.length) {
        await tx.facultySubject.createMany({
          data: subjectIds.map((sid) => ({ facultyId: id, subjectId: sid })),
        });
      }
    }

    return tx.faculty.update({
      where: { id },
      data: {
        ...scalarFields,
        ...(joiningDate !== undefined ? { joiningDate: new Date(joiningDate) } : {}),
      },
      include: {
        teachingSubjects: {
          include: { subject: { select: { id: true, name: true, examCategories: { include: { examCategory: true } } } } },
          orderBy: { subject: { name: "asc" } },
        },
      },
    });
  });

  return { ok: true, faculty: serializeFaculty(faculty) };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export type DeleteFacultyResult =
  | { ok: true }
  | { ok: false; notFound: true };

export async function deleteFaculty(id: string, tenantId: string): Promise<DeleteFacultyResult> {
  const existing = await prisma.faculty.findFirst({ where: { id, tenantId } });
  if (!existing) return { ok: false, notFound: true };

  // FacultySubject rows cascade-delete via schema (onDelete: Cascade)
  await prisma.faculty.delete({ where: { id } });
  return { ok: true };
}
