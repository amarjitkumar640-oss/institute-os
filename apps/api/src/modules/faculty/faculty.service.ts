import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import type { CreateFacultyInput, UpdateFacultyInput } from "@institute-os/shared";
import { facultyQuerySchema } from "@institute-os/shared";
import { z } from "zod";
import { getSignedPhotoUrl } from "../../lib/s3";

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
    staff: { photoUrl: string | null } | null;
  }
>(f: T) {
  const { teachingSubjects, staff, ...rest } = f;
  return {
    ...rest,
    joiningDate: rest.joiningDate.toISOString().slice(0, 10),
    subjects: teachingSubjects.map((ts) => serializeSubject(ts.subject)),
    // Bare S3 key here (not yet signed) — resolved to a short-lived signed
    // URL by the caller (listFaculty/getFaculty), same two-step pattern as
    // Student.photoUrl/Staff.photoUrl. Faculty has no photo of its own; this
    // surfaces the linked staff login's photo, if any, since the faculty
    // list/detail screens are displaying that same person.
    photoUrl: staff?.photoUrl ?? null,
  };
}

// ─── Auto employee-code ───────────────────────────────────────────────────────

async function nextEmployeeCode(tenantId: string): Promise<string> {
  const count = await prisma.faculty.count({ where: { tenantId } });
  return `FAC${String(count + 1).padStart(4, "0")}`;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listFaculty(query: FacultyQuery, tenantId: string, centerIds: string[]) {
  const { search, examCategoryId, isActive, page, limit } = query;

  const where: Prisma.FacultyWhereInput = { tenantId, centerId: { in: centerIds } };

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
    staff: { select: { photoUrl: true } },
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

  const data = await Promise.all(
    rows.map(serializeFaculty).map(async (f) => ({
      ...f,
      photoUrl: f.photoUrl ? await getSignedPhotoUrl(f.photoUrl) : null,
    }))
  );

  return {
    data,
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
      staff: { select: { photoUrl: true } },
    },
  });
  if (!f) return null;
  const serialized = serializeFaculty(f);
  return { ...serialized, photoUrl: serialized.photoUrl ? await getSignedPhotoUrl(serialized.photoUrl) : null };
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
      staff: { select: { photoUrl: true } },
    },
  });

  const serialized = serializeFaculty(faculty);
  return { ok: true, faculty: { ...serialized, photoUrl: serialized.photoUrl ? await getSignedPhotoUrl(serialized.photoUrl) : null } };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export type UpdateFacultyResult =
  | { ok: true; faculty: ReturnType<typeof serializeFaculty> }
  | { ok: false; notFound: true }
  | { ok: false; emailConflict: true }
  | { ok: false; phoneConflict: true }
  | { ok: false; staffNotFound: true }
  | { ok: false; staffConflict: true };

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
  if (data.staffId !== undefined && data.staffId !== existing.staffId) {
    if (data.staffId !== null) {
      const staff = await prisma.staff.findFirst({ where: { id: data.staffId, tenantId, roles: { has: "teacher" } } });
      if (!staff) return { ok: false, staffNotFound: true };
      const clash = await prisma.faculty.findUnique({ where: { staffId: data.staffId } });
      if (clash) return { ok: false, staffConflict: true };
    }
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
        staff: { select: { photoUrl: true } },
      },
    });
  });

  const serialized = serializeFaculty(faculty);
  return { ok: true, faculty: { ...serialized, photoUrl: serialized.photoUrl ? await getSignedPhotoUrl(serialized.photoUrl) : null } };
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

// ─── Attendance (per-day register, not per-session — see schema comment) ──────
// Marked by admin/frontdesk, same day-to-day-operations role gate as fee
// collection (fees.routes.ts), not admin-only like faculty CRUD above.

export async function getFacultyAttendanceRoster(tenantId: string, centerIds: string[], date: string) {
  const [faculty, marks] = await Promise.all([
    prisma.faculty.findMany({
      where: { tenantId, centerId: { in: centerIds }, isActive: true },
      select: { id: true, fullName: true, employeeCode: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.facultyAttendance.findMany({
      where: { date: new Date(date), faculty: { tenantId, centerId: { in: centerIds } } },
      select: { facultyId: true, status: true },
    }),
  ]);

  const markMap = new Map(marks.map((m) => [m.facultyId, m.status]));
  return faculty.map((f) => ({
    facultyId:    f.id,
    fullName:     f.fullName,
    employeeCode: f.employeeCode,
    status:       markMap.get(f.id) ?? null,
  }));
}

export async function setFacultyAttendance(
  tenantId: string,
  centerIds: string[],
  date: string,
  marks: { facultyId: string; status: "present" | "absent" }[],
  markedById: string | null,
) {
  // Only faculty actually in scope for this tenant/center may be marked —
  // silently drop anything else rather than trusting client-supplied IDs.
  const inScope = new Set(
    (await prisma.faculty.findMany({
      where: { tenantId, centerId: { in: centerIds }, id: { in: marks.map((m) => m.facultyId) } },
      select: { id: true },
    })).map((f) => f.id),
  );

  await Promise.all(
    marks.filter((m) => inScope.has(m.facultyId)).map((m) =>
      prisma.facultyAttendance.upsert({
        where:  { facultyId_date: { facultyId: m.facultyId, date: new Date(date) } },
        update: { status: m.status, markedById, markedAt: new Date() },
        create: { facultyId: m.facultyId, date: new Date(date), status: m.status, markedById },
      }),
    ),
  );
  return getFacultyAttendanceRoster(tenantId, centerIds, date);
}
