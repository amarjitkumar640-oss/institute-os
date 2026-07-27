import { PrismaClient } from "@prisma/client";
import type { CreateSlotInput, UpdateSlotInput, CreateAdHocSessionInput, PatchSessionInput, GenerateSessionsInput } from "@institute-os/shared";

// Maps our DayOfWeek enum to Date.getDay() values (0 = Sunday)
const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const SLOT_INCLUDE = {
  subject: { select: { id: true, name: true } },
  faculty: { select: { id: true, fullName: true, employeeCode: true } },
  batch:   { select: { id: true, name: true } },
} as const;

const SESSION_INCLUDE = {
  slot: {
    select: {
      id:       true,
      dayOfWeek: true,
      subject:  { select: { id: true, name: true } },
      faculty:  { select: { id: true, fullName: true, employeeCode: true } },
    },
  },
  subject: { select: { id: true, name: true } },
  faculty: { select: { id: true, fullName: true, employeeCode: true } },
  batch:   { select: { id: true, name: true } },
} as const;

// ── Slots ─────────────────────────────────────────────────────────────────────

export async function listSlots(prisma: PrismaClient, batchId: string, tenantId: string) {
  return prisma.classSlot.findMany({
    where:   { batchId, isActive: true, batch: { tenantId } },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: SLOT_INCLUDE,
  });
}

export async function createSlot(prisma: PrismaClient, batchId: string, tenantId: string, data: CreateSlotInput) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) return null;

  return prisma.classSlot.create({
    data: {
      batchId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime:   data.endTime,
      subjectId: data.subjectId ?? null,
      facultyId: data.facultyId ?? null,
      room:      data.room      ?? null,
      validFrom: new Date(data.validFrom),
      validTo:   data.validTo ? new Date(data.validTo) : null,
    },
    include: SLOT_INCLUDE,
  });
}

export async function updateSlot(prisma: PrismaClient, slotId: string, tenantId: string, data: UpdateSlotInput) {
  const existing = await prisma.classSlot.findFirst({ where: { id: slotId, batch: { tenantId } } });
  if (!existing) return null;

  const slot = await prisma.classSlot.update({
    where: { id: slotId },
    data: {
      ...(data.startTime !== undefined && { startTime: data.startTime }),
      ...(data.endTime   !== undefined && { endTime:   data.endTime   }),
      ...(data.subjectId !== undefined && { subjectId: data.subjectId }),
      ...(data.facultyId !== undefined && { facultyId: data.facultyId }),
      ...(data.room      !== undefined && { room:      data.room      }),
      ...(data.validTo   !== undefined && { validTo:   data.validTo ? new Date(data.validTo) : null }),
      ...(data.isActive  !== undefined && { isActive:  data.isActive  }),
    },
    include: SLOT_INCLUDE,
  });

  // Cascade subject/faculty to future scheduled sessions so they pick up the updated assignment
  if (data.subjectId !== undefined || data.facultyId !== undefined) {
    await prisma.classSession.updateMany({
      where: { slotId, status: "scheduled" },
      data: {
        ...(data.subjectId !== undefined && { subjectId: data.subjectId }),
        ...(data.facultyId !== undefined && { facultyId: data.facultyId }),
      },
    });
  }

  return slot;
}

export async function deleteSlot(prisma: PrismaClient, slotId: string, tenantId: string) {
  const existing = await prisma.classSlot.findFirst({ where: { id: slotId, batch: { tenantId } } });
  if (!existing) return null;

  return prisma.classSlot.update({
    where: { id: slotId },
    data:  { isActive: false },
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function listSessions(
  prisma: PrismaClient,
  batchId: string,
  tenantId: string,
  params: { from: string; to: string; status?: string },
) {
  return prisma.classSession.findMany({
    where: {
      batchId,
      batch: { tenantId },
      scheduledDate: {
        gte: new Date(params.from + "T00:00:00.000Z"),
        lte: new Date(params.to   + "T23:59:59.999Z"),
      },
      ...(params.status ? { status: params.status as any } : {}),
    },
    orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    include: SESSION_INCLUDE,
  });
}

export async function createAdHocSession(
  prisma: PrismaClient,
  batchId: string,
  tenantId: string,
  data: CreateAdHocSessionInput,
) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) return null;

  return prisma.classSession.create({
    data: {
      batchId,
      slotId:        null,
      scheduledDate: new Date(data.scheduledDate),
      startTime:     data.startTime,
      endTime:       data.endTime,
      type:          data.type,
      subjectId:     data.subjectId ?? null,
      facultyId:     data.facultyId ?? null,
      room:          data.room      ?? null,
      notes:         data.notes     ?? null,
    },
    include: SESSION_INCLUDE,
  });
}

export async function patchSession(
  prisma: PrismaClient,
  sessionId: string,
  tenantId: string,
  data: PatchSessionInput,
) {
  const existing = await prisma.classSession.findFirst({ where: { id: sessionId, batch: { tenantId } } });
  if (!existing) return null;

  return prisma.classSession.update({
    where: { id: sessionId },
    data: {
      ...(data.status        !== undefined && { status:        data.status        }),
      ...(data.scheduledDate !== undefined && { scheduledDate: new Date(data.scheduledDate) }),
      ...(data.startTime     !== undefined && { startTime:     data.startTime     }),
      ...(data.endTime       !== undefined && { endTime:       data.endTime       }),
      ...(data.facultyId     !== undefined && { facultyId:     data.facultyId     }),
      ...(data.subjectId     !== undefined && { subjectId:     data.subjectId     }),
      ...(data.room          !== undefined && { room:          data.room          }),
      ...(data.cancelReason  !== undefined && { cancelReason:  data.cancelReason  }),
      ...(data.notes         !== undefined && { notes:         data.notes         }),
    },
    include: SESSION_INCLUDE,
  });
}

// ── Generate sessions from slots ──────────────────────────────────────────────

export async function generateSessions(
  prisma: PrismaClient,
  batchId: string,
  tenantId: string,
  params: GenerateSessionsInput,
): Promise<{ created: number } | null> {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) return null;

  const slots = await prisma.classSlot.findMany({
    where: { batchId, isActive: true },
  });

  if (slots.length === 0) return { created: 0 };

  // Use UTC throughout so date arithmetic is timezone-agnostic.
  // "2026-07-13" → midnight UTC → getUTCDay() = 1 (Monday) regardless of server TZ.
  const cursor = new Date(params.from + "T00:00:00.000Z");
  const to     = new Date(params.to   + "T23:59:59.999Z");
  let created = 0;

  while (cursor <= to) {
    const dayIndex = cursor.getUTCDay(); // 0 = Sunday, in UTC

    for (const slot of slots) {
      if (DAY_INDEX[slot.dayOfWeek] !== dayIndex) continue;

      // Check slot validity window (compare as UTC midnight)
      const slotFrom = new Date(slot.validFrom);
      slotFrom.setUTCHours(0, 0, 0, 0);
      if (cursor < slotFrom) continue;
      if (slot.validTo) {
        const slotTo = new Date(slot.validTo);
        slotTo.setUTCHours(23, 59, 59, 999);
        if (cursor > slotTo) continue;
      }

      // Canonical date for this session: UTC midnight of the current day
      const sessionDate = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())
      );

      // Skip if session already exists for this slot+date
      const existing = await prisma.classSession.findUnique({
        where: { slotId_scheduledDate: { slotId: slot.id, scheduledDate: sessionDate } },
      });
      if (existing) continue;

      await prisma.classSession.create({
        data: {
          batchId,
          slotId:        slot.id,
          scheduledDate: sessionDate,
          startTime:     slot.startTime,
          endTime:       slot.endTime,
          subjectId:     slot.subjectId,
          facultyId:     slot.facultyId,
          room:          slot.room,
          type:          "regular",
          status:        "scheduled",
        },
      });
      created++;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { created };
}

// ── Faculty sessions (cross-batch view) ──────────────────────────────────────

export async function listFacultySessions(
  prisma: PrismaClient,
  facultyId: string,
  tenantId: string,
  params: { from: string; to: string },
) {
  return prisma.classSession.findMany({
    where: {
      facultyId,
      batch: { tenantId },
      scheduledDate: {
        gte: new Date(params.from + "T00:00:00.000Z"),
        lte: new Date(params.to   + "T23:59:59.999Z"),
      },
    },
    orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
    include: SESSION_INCLUDE,
  });
}

// ── Today's sessions (dashboard widget) ──────────────────────────────────────

export async function listTodaySessions(
  prisma: PrismaClient,
  tenantId: string,
  centerId?: string,
) {
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC

  return prisma.classSession.findMany({
    where: {
      scheduledDate: {
        gte: new Date(todayStr + "T00:00:00.000Z"),
        lte: new Date(todayStr + "T23:59:59.999Z"),
      },
      status: "scheduled",
      batch: { tenantId, ...(centerId ? { centerId } : {}) },
    },
    orderBy: { startTime: "asc" },
    include: SESSION_INCLUDE,
  });
}
