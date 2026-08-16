import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb, legacyPermissionsForRole } from "./setup";
import type { AuthPayload } from "../middleware/auth";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = new Date().toISOString().slice(0, 10);

async function ensureTestTenant() {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: "Test Institute", slug: "test-institute" },
  });
}

async function makeAdmin() {
  await ensureTestTenant();
  const passwordHash = await bcrypt.hash("secret123", 10);
  return prisma.staff.create({
    data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9100000000", email: "admin@x.test", roles: ["admin"], passwordHash },
  });
}

async function makeCourseAndBatch(capacity: number) {
  await ensureTestTenant();
  const course = await prisma.course.create({
    data: { tenantId: TENANT_ID, name: "SSC CGL Foundation", durationMonths: 6, defaultFee: 10000 },
  });
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, name: "SSC-Morning-A", capacity,
      startDate: new Date(), endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
}

async function makeTeacherWithFaculty(label: string, batchId: string) {
  const passwordHash = await bcrypt.hash("secret123", 10);
  const staff = await prisma.staff.create({
    data: {
      tenantId: TENANT_ID, fullName: `${label} Teacher`, phone: `9${label.charCodeAt(0)}0000000`,
      email: `${label.toLowerCase()}@teacher.test`, roles: ["teacher"], passwordHash,
    },
  });
  const faculty = await prisma.faculty.create({
    data: {
      tenantId: TENANT_ID, employeeCode: `FAC-${label}`, fullName: `${label} Teacher`,
      phone: staff.phone, email: staff.email, qualification: "M.Sc",
      joiningDate: new Date(), staffId: staff.id,
    },
  });
  const session = await prisma.classSession.create({
    data: {
      batchId, facultyId: faculty.id, scheduledDate: new Date(`${TODAY}T00:00:00.000Z`),
      startTime: "09:00", endTime: "10:00", status: "scheduled",
    },
  });
  return { staff, faculty, session };
}

function tokenFor(payload: AuthPayload) {
  const permissions = payload.permissions ?? legacyPermissionsForRole([payload.activeRole]);
  return jwt.sign({ ...payload, permissions }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

async function makeStudent(code: string) {
  return prisma.student.create({
    data: { tenantId: TENANT_ID, studentCode: code, fullName: `Student ${code}`, phone: `8${code}` },
  });
}

describe("notification triggers", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  describe("session cancelled / rescheduled", () => {
    it("notifies the linked teacher when their session is cancelled", async () => {
      const batch = await makeCourseAndBatch(10);
      const { staff, session } = await makeTeacherWithFaculty("A", batch.id);
      const admin = await makeAdmin();
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .patch(`/api/schedule/class-sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "cancelled", cancelReason: "Faculty unavailable" });
      expect(res.status).toBe(200);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("session_cancelled");
    });

    it("notifies the linked teacher when their session is rescheduled", async () => {
      const batch = await makeCourseAndBatch(10);
      const { staff, session } = await makeTeacherWithFaculty("A", batch.id);
      const admin = await makeAdmin();
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .patch(`/api/schedule/class-sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ startTime: "11:00", endTime: "12:00" });
      expect(res.status).toBe(200);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("session_rescheduled");
    });

    it("does not notify (and does not error) when the session's faculty has no linked staff login", async () => {
      const batch = await makeCourseAndBatch(10);
      const admin = await makeAdmin();
      const faculty = await prisma.faculty.create({
        data: {
          tenantId: TENANT_ID, employeeCode: "FAC-UNLINKED", fullName: "Unlinked Faculty",
          phone: "9999999990", email: "unlinked-faculty@x.test", qualification: "M.Sc", joiningDate: new Date(),
        },
      });
      const session = await prisma.classSession.create({
        data: { batchId: batch.id, facultyId: faculty.id, scheduledDate: new Date(`${TODAY}T00:00:00.000Z`), startTime: "09:00", endTime: "10:00", status: "scheduled" },
      });
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .patch(`/api/schedule/class-sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "cancelled" });
      expect(res.status).toBe(200);

      const notifications = await prisma.notification.findMany();
      expect(notifications).toHaveLength(0);
    });
  });

  describe("session subject/faculty reassignment", () => {
    it("reassigning subject+faculty together notifies the outgoing teacher with the OLD subject and the incoming teacher with the NEW subject", async () => {
      const batch = await makeCourseAndBatch(10);
      const computer = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Computer" } });
      const maths = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Maths" } });
      const { staff: staffA, session } = await makeTeacherWithFaculty("A", batch.id);
      await prisma.classSession.update({ where: { id: session.id }, data: { subjectId: computer.id } });
      const { staff: staffB, faculty: facultyB } = await makeTeacherWithFaculty("B", batch.id);
      const admin = await makeAdmin();
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .patch(`/api/schedule/class-sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ subjectId: maths.id, facultyId: facultyB.id });
      expect(res.status).toBe(200);

      const outgoing = await prisma.notification.findMany({ where: { recipientId: staffA.id } });
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].type).toBe("session_cancelled");
      expect(outgoing[0].body).toContain("Computer");
      expect(outgoing[0].body).not.toContain("Maths");

      const incoming = await prisma.notification.findMany({ where: { recipientId: staffB.id } });
      expect(incoming).toHaveLength(1);
      expect(incoming[0].type).toBe("session_assigned");
      expect(incoming[0].body).toContain("Maths");
    });

    it("changing only the subject (same teacher) fires session_subject_changed naming both subjects, not a reassignment", async () => {
      const batch = await makeCourseAndBatch(10);
      const computer = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Computer" } });
      const maths = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Maths" } });
      const { staff, session } = await makeTeacherWithFaculty("A", batch.id);
      await prisma.classSession.update({ where: { id: session.id }, data: { subjectId: computer.id } });
      const admin = await makeAdmin();
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .patch(`/api/schedule/class-sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ subjectId: maths.id });
      expect(res.status).toBe(200);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe("session_subject_changed");
      expect(notifications[0].body).toContain("Computer");
      expect(notifications[0].body).toContain("Maths");
    });

    it("does not notify at all when subjectId is set to the same value it already had", async () => {
      const batch = await makeCourseAndBatch(10);
      const computer = await prisma.subject.create({ data: { tenantId: TENANT_ID, name: "Computer" } });
      const { staff, session } = await makeTeacherWithFaculty("A", batch.id);
      await prisma.classSession.update({ where: { id: session.id }, data: { subjectId: computer.id } });
      const admin = await makeAdmin();
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .patch(`/api/schedule/class-sessions/${session.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ subjectId: computer.id });
      expect(res.status).toBe(200);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id } });
      expect(notifications).toHaveLength(0);
    });
  });

  describe("new enrollment", () => {
    it("notifies admin (default routing) when a student enrolls", async () => {
      const batch = await makeCourseAndBatch(10);
      const admin = await makeAdmin();
      const student = await makeStudent("0001");
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app)
        .post("/api/enrollments")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: student.id, batchId: batch.id });
      expect(res.status).toBe(201);

      const notifications = await prisma.notification.findMany({ where: { recipientId: admin.id, type: "new_enrollment" } });
      expect(notifications).toHaveLength(1);
    });

    it("respects a tenant's routing override (frontdesk instead of admin)", async () => {
      const batch = await makeCourseAndBatch(10);
      const admin = await makeAdmin();
      const passwordHash = await bcrypt.hash("secret123", 10);
      const frontdesk = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "FD", phone: "9222222222", email: "fd@x.test", roles: ["frontdesk"], passwordHash },
      });
      await prisma.notificationRoutingRule.create({
        data: { tenantId: TENANT_ID, type: "new_enrollment", roles: ["frontdesk"] },
      });
      const student = await makeStudent("0002");
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      await request(app).post("/api/enrollments").set("Authorization", `Bearer ${token}`).send({ studentId: student.id, batchId: batch.id });

      expect(await prisma.notification.count({ where: { recipientId: admin.id, type: "new_enrollment" } })).toBe(0);
      expect(await prisma.notification.count({ where: { recipientId: frontdesk.id, type: "new_enrollment" } })).toBe(1);
    });
  });

  describe("batch capacity", () => {
    it("fires batch_capacity exactly when the batch hits 90% and 100%, not at other counts", async () => {
      // capacity 10 → 90% = 9, 100% = 10
      const batch = await makeCourseAndBatch(10);
      const admin = await makeAdmin();
      const passwordHash = await bcrypt.hash("secret123", 10);
      const frontdesk = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "FD", phone: "9333333333", email: "fd2@x.test", roles: ["frontdesk"], passwordHash },
      });
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      for (let i = 1; i <= 10; i++) {
        const student = await makeStudent(String(1000 + i));
        const res = await request(app)
          .post("/api/enrollments")
          .set("Authorization", `Bearer ${token}`)
          .send({ studentId: student.id, batchId: batch.id });
        expect(res.status).toBe(201);
      }

      const capacityNotifications = await prisma.notification.findMany({
        where: { recipientId: frontdesk.id, type: "batch_capacity" },
        orderBy: { createdAt: "asc" },
      });
      expect(capacityNotifications).toHaveLength(2);
      expect(capacityNotifications[0].title).toBe("Batch nearly full");
      expect(capacityNotifications[1].title).toBe("Batch is full");
    });

    it("11th enrollment attempt is rejected (batch full) and does not double-notify", async () => {
      const batch = await makeCourseAndBatch(1);
      const admin = await makeAdmin();
      const passwordHash = await bcrypt.hash("secret123", 10);
      await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "FD", phone: "9444444444", email: "fd3@x.test", roles: ["frontdesk"], passwordHash },
      });
      const token = tokenFor({ staffId: admin.id, roles: ["admin"], activeRole: "admin", centerId: null, tenantId: TENANT_ID });

      const s1 = await makeStudent("2001");
      const s2 = await makeStudent("2002");
      const first = await request(app).post("/api/enrollments").set("Authorization", `Bearer ${token}`).send({ studentId: s1.id, batchId: batch.id });
      expect(first.status).toBe(201);

      const second = await request(app).post("/api/enrollments").set("Authorization", `Bearer ${token}`).send({ studentId: s2.id, batchId: batch.id });
      expect(second.status).toBe(409);

      const capacityCount = await prisma.notification.count({ where: { type: "batch_capacity" } });
      expect(capacityCount).toBe(1); // only from the successful 1st enrollment hitting 100% of capacity 1
    });
  });
});
