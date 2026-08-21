import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

const TENANT_ID = "22222222-2222-2222-2222-222222222222";

async function ensureTestTenant() {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Test Institute 2", slug: "test-institute-2" },
  });
}

async function makeAdmin() {
  await ensureTestTenant();
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9100000001", email: "admin2@x.test", roles: ["admin"], passwordHash },
  });
}

async function makeCourseAndBatch() {
  await ensureTestTenant();
  const course = await prisma.course.create({
    data: { tenantId: TENANT_ID, name: "SSC CGL Foundation", durationMonths: 6, defaultFee: 10000 },
  });
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, name: "SSC-Morning-B", capacity: 10,
      startDate: new Date(), endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
    },
  });
}

async function makeSession(
  batchId: string, scheduledDate: string,
  times: { startTime?: string; endTime?: string } = {},
) {
  return prisma.classSession.create({
    data: {
      batchId, scheduledDate: new Date(`${scheduledDate}T00:00:00.000Z`),
      startTime: times.startTime ?? "09:00", endTime: times.endTime ?? "10:00", status: "scheduled",
    },
  });
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

// "HH:MM" offset from right now, in the server's local time — matches how
// patchSession itself compares (toTimeString(), not UTC). Used to build
// same-day sessions whose end time is deterministically already-passed or
// not-yet-reached, regardless of what time the test suite happens to run.
function hhmmOffset(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60000).toTimeString().slice(0, 5);
}

describe("session completion date validation", () => {
  // Pin the clock to a fixed midday moment for this whole block. hhmmOffset
  // builds same-day "before/after now" timestamps as bare HH:MM strings, and
  // sessionHasEnded (schedule.service.ts) compares those as strings — which
  // silently breaks whenever an offset crosses midnight (e.g. 70 minutes
  // from 23:35 wraps to "00:45", which then string-compares as EARLIER than
  // "23:35" even though it's actually still in the future). Freezing "now"
  // at noon keeps every offset used below safely within the same day,
  // regardless of what real-world time the suite happens to run at — only
  // Date is faked (setTimeout/etc left real) so the actual DB/HTTP calls
  // these tests make still run normally.
  beforeAll(() => {
    jest.useFakeTimers({
      doNotFake: ["setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "clearImmediate", "nextTick", "queueMicrotask", "hrtime", "performance"],
    });
    jest.setSystemTime(new Date("2026-01-15T12:00:00"));
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects marking a future-dated session as completed", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(3));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended/i);

    const unchanged = await prisma.classSession.findUnique({ where: { id: session.id } });
    expect(unchanged?.status).toBe("scheduled");
  });

  it("allows cancelling a future-dated session", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(3));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("allows completing today's session once its end time has passed", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(0), {
      startTime: hhmmOffset(-90), endTime: hhmmOffset(-30),
    });
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("rejects completing today's session before its end time has passed", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(0), {
      startTime: hhmmOffset(10), endTime: hhmmOffset(70),
    });
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ended/i);
  });

  it("rejects completing when the same request reschedules the end time forward to later today", async () => {
    const batch = await makeCourseAndBatch();
    // Currently already-ended, but the PATCH also pushes endTime forward —
    // validation must use the NEW end time, not the session's old one.
    const session = await makeSession(batch.id, isoDate(0), {
      startTime: hhmmOffset(-90), endTime: hhmmOffset(-30),
    });
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed", endTime: hhmmOffset(60) });

    expect(res.status).toBe(400);
  });

  it("allows completing a past session", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(-2));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });

  it("rejects rescheduling to a future date and completing in the same request", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(-1));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed", scheduledDate: isoDate(5) });

    expect(res.status).toBe(400);
  });
});

async function makeTeacherWithFaculty(label: string) {
  const passwordHash = await bcrypt.hash("secret123", 10);
  const staff = await prisma.staff.create({
    data: {
      tenantId: TENANT_ID, fullName: `${label} Teacher`, phone: `92${label.charCodeAt(0)}000000`,
      email: `${label.toLowerCase()}@teacher2.test`, roles: ["teacher"], passwordHash,
    },
  });
  const faculty = await prisma.faculty.create({
    data: {
      tenantId: TENANT_ID, employeeCode: `FAC2-${label}`, fullName: `${label} Teacher`,
      phone: staff.phone, email: staff.email, qualification: "M.Sc",
      joiningDate: new Date(), staffId: staff.id,
    },
  });
  return { staff, faculty };
}

describe("teacher cannot cancel a class", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects a teacher cancelling their own session", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty } = await makeTeacherWithFaculty("A");
    const session = await prisma.classSession.create({
      data: {
        batchId: batch.id, facultyId: faculty.id, scheduledDate: new Date(`${isoDate(0)}T00:00:00.000Z`),
        startTime: "09:00", endTime: "10:00", status: "scheduled",
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "cancelled" });

    expect(res.status).toBe(403);

    const unchanged = await prisma.classSession.findUnique({ where: { id: session.id } });
    expect(unchanged?.status).toBe("scheduled");
  });

  it("still allows admin to cancel", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(0));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "cancelled" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
  });

  it("still allows a teacher to mark their own ended session completed", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty } = await makeTeacherWithFaculty("B");
    const session = await prisma.classSession.create({
      data: {
        batchId: batch.id, facultyId: faculty.id, scheduledDate: new Date(`${isoDate(0)}T00:00:00.000Z`),
        startTime: hhmmOffset(-90), endTime: hhmmOffset(-30), status: "scheduled",
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
  });
});

describe("teacher cannot reassign subject or faculty", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects a teacher changing the subject of their own session", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty } = await makeTeacherWithFaculty("C");
    const subject = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Reasoning" } });
    const session = await prisma.classSession.create({
      data: {
        batchId: batch.id, facultyId: faculty.id, scheduledDate: new Date(`${isoDate(0)}T00:00:00.000Z`),
        startTime: "09:00", endTime: "10:00", status: "scheduled",
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subjectId: subject.id });

    expect(res.status).toBe(403);
  });

  it("rejects a teacher reassigning the faculty of their own session", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty: facultyA } = await makeTeacherWithFaculty("D");
    const { faculty: facultyB } = await makeTeacherWithFaculty("E");
    const session = await prisma.classSession.create({
      data: {
        batchId: batch.id, facultyId: facultyA.id, scheduledDate: new Date(`${isoDate(0)}T00:00:00.000Z`),
        startTime: "09:00", endTime: "10:00", status: "scheduled",
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: facultyA.id });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ facultyId: facultyB.id });

    expect(res.status).toBe(403);

    const unchanged = await prisma.classSession.findUnique({ where: { id: session.id } });
    expect(unchanged?.facultyId).toBe(facultyA.id);
  });

  it("still allows admin to reassign subject and faculty", async () => {
    const batch = await makeCourseAndBatch();
    const { faculty } = await makeTeacherWithFaculty("F");
    const subject = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Quant" } });
    const session = await makeSession(batch.id, isoDate(0));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subjectId: subject.id, facultyId: faculty.id });

    expect(res.status).toBe(200);
    expect(res.body.subjectId).toBe(subject.id);
    expect(res.body.facultyId).toBe(faculty.id);
  });
});

describe("teacher cannot mark attendance", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects a teacher marking attendance for their own session", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty } = await makeTeacherWithFaculty("G");
    const session = await prisma.classSession.create({
      data: {
        batchId: batch.id, facultyId: faculty.id, scheduledDate: new Date(`${isoDate(0)}T00:00:00.000Z`),
        startTime: "09:00", endTime: "10:00", status: "scheduled",
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

    const res = await request(app)
      .put(`/api/schedule/class-sessions/${session.id}/attendance`)
      .set("Authorization", `Bearer ${token}`)
      .send({ marks: [] });

    expect(res.status).toBe(403);
  });

  it("still allows a teacher to view (GET) the roster for their own session", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty } = await makeTeacherWithFaculty("H");
    const session = await prisma.classSession.create({
      data: {
        batchId: batch.id, facultyId: faculty.id, scheduledDate: new Date(`${isoDate(0)}T00:00:00.000Z`),
        startTime: "09:00", endTime: "10:00", status: "scheduled",
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

    const res = await request(app)
      .get(`/api/schedule/class-sessions/${session.id}/attendance`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("still allows admin to mark attendance", async () => {
    const batch = await makeCourseAndBatch();
    const session = await makeSession(batch.id, isoDate(0));
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .put(`/api/schedule/class-sessions/${session.id}/attendance`)
      .set("Authorization", `Bearer ${token}`)
      .send({ marks: [] });

    expect(res.status).toBe(200);
  });
});

describe("teacher cannot edit the weekly slot template", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects a teacher editing a slot in their own batch", async () => {
    const batch = await makeCourseAndBatch();
    const { staff, faculty } = await makeTeacherWithFaculty("I");
    const slot = await prisma.classSlot.create({
      data: {
        batchId: batch.id, facultyId: faculty.id, dayOfWeek: "monday",
        startTime: "09:00", endTime: "10:00", validFrom: new Date(),
      },
    });
    const token = tokenFor({ staffId: staff.id, roles: ["teacher"], activeRole: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

    const res = await request(app)
      .patch(`/api/schedule/class-slots/${slot.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ room: "Room 5" });

    expect(res.status).toBe(403);

    const unchanged = await prisma.classSlot.findUnique({ where: { id: slot.id } });
    expect(unchanged?.room).toBeNull();
  });

  it("still allows admin to edit a slot", async () => {
    const batch = await makeCourseAndBatch();
    const slot = await prisma.classSlot.create({
      data: { batchId: batch.id, dayOfWeek: "monday", startTime: "09:00", endTime: "10:00", validFrom: new Date() },
    });
    const admin = await makeAdmin();
    const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

    const res = await request(app)
      .patch(`/api/schedule/class-slots/${slot.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ room: "Room 5" });

    expect(res.status).toBe(200);
    expect(res.body.room).toBe("Room 5");
  });
});
