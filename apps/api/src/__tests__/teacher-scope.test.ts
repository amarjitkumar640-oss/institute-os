import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { resetDb } from "./setup";
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

async function makeCourseAndBatch() {
  await ensureTestTenant();
  const course = await prisma.course.create({
    data: { tenantId: TENANT_ID, name: "SSC CGL Foundation", durationMonths: 6, defaultFee: 10000 },
  });
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID,
      courseId: course.id,
      name: "SSC-Morning-A",
      capacity: 50,
      startDate: new Date(),
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
}

async function makeTeacherWithFaculty(label: string, batchId: string) {
  const passwordHash = await bcrypt.hash("secret123", 10);
  const staff = await prisma.staff.create({
    data: {
      tenantId: TENANT_ID, fullName: `${label} Teacher`, phone: `9${label.charCodeAt(0)}0000000`,
      email: `${label.toLowerCase()}@teacher.test`, role: "teacher", passwordHash,
    },
  });
  const faculty = await prisma.faculty.create({
    data: {
      tenantId: TENANT_ID, employeeCode: `FAC-${label}`, fullName: `${label} Teacher`,
      phone: staff.phone, email: staff.email, qualification: "M.Sc",
      joiningDate: new Date(), staffId: staff.id,
    },
  });
  await prisma.classSlot.create({
    data: {
      batchId, facultyId: faculty.id, dayOfWeek: "monday",
      startTime: "09:00", endTime: "10:00", validFrom: new Date(), isActive: true,
    },
  });
  await prisma.classSession.create({
    data: {
      batchId, facultyId: faculty.id, scheduledDate: new Date(`${TODAY}T00:00:00.000Z`),
      startTime: "09:00", endTime: "10:00", status: "scheduled",
    },
  });
  return { staff, faculty };
}

function tokenFor(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

describe("teacher scoping", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  describe("GET /api/schedule/faculty/:facultyId/sessions", () => {
    it("403s a teacher with no linked faculty, for any facultyId", async () => {
      const batch = await makeCourseAndBatch();
      const { faculty } = await makeTeacherWithFaculty("A", batch.id);
      const passwordHash = await bcrypt.hash("secret123", 10);
      const unlinked = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Unlinked", phone: "9000000099", email: "unlinked@teacher.test", role: "teacher", passwordHash },
      });
      const token = tokenFor({ staffId: unlinked.id, role: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: null });

      const res = await request(app)
        .get(`/api/schedule/faculty/${faculty.id}/sessions`)
        .query({ from: TODAY, to: TODAY })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("lets a teacher fetch their own linked faculty's sessions", async () => {
      const batch = await makeCourseAndBatch();
      const { staff, faculty } = await makeTeacherWithFaculty("A", batch.id);
      const token = tokenFor({ staffId: staff.id, role: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });

      const res = await request(app)
        .get(`/api/schedule/faculty/${faculty.id}/sessions`)
        .query({ from: TODAY, to: TODAY })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("403s a teacher trying to fetch a different faculty member's sessions", async () => {
      const batch = await makeCourseAndBatch();
      const { staff: staffA } = await makeTeacherWithFaculty("A", batch.id);
      const { faculty: facultyB } = await makeTeacherWithFaculty("B", batch.id);
      const linkedA = await prisma.faculty.findFirstOrThrow({ where: { staffId: staffA.id } });
      const tokenALinked = tokenFor({ staffId: staffA.id, role: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: linkedA.id });

      const res = await request(app)
        .get(`/api/schedule/faculty/${facultyB.id}/sessions`)
        .query({ from: TODAY, to: TODAY })
        .set("Authorization", `Bearer ${tokenALinked}`);

      expect(res.status).toBe(403);
    });

    it("does not restrict admin or frontdesk — same as before this change", async () => {
      const batch = await makeCourseAndBatch();
      const { faculty } = await makeTeacherWithFaculty("A", batch.id);
      const passwordHash = await bcrypt.hash("secret123", 10);
      const admin = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9111111111", email: "admin@x.test", role: "admin", passwordHash },
      });
      const frontdesk = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Front Desk", phone: "9222222222", email: "fd@x.test", role: "frontdesk", passwordHash },
      });
      const adminToken = tokenFor({ staffId: admin.id, role: "admin", centerId: null, tenantId: TENANT_ID });
      const fdToken = tokenFor({ staffId: frontdesk.id, role: "frontdesk", centerId: null, tenantId: TENANT_ID });

      for (const token of [adminToken, fdToken]) {
        const res = await request(app)
          .get(`/api/schedule/faculty/${faculty.id}/sessions`)
          .query({ from: TODAY, to: TODAY })
          .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
      }
    });
  });

  describe("GET /api/dashboard/teacher", () => {
    it("returns linked:false when the teacher's Staff account has no Faculty link", async () => {
      const passwordHash = await bcrypt.hash("secret123", 10);
      const unlinked = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Unlinked", phone: "9333333333", email: "unlinked2@teacher.test", role: "teacher", passwordHash },
      });
      const token = tokenFor({ staffId: unlinked.id, role: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: null });

      const res = await request(app).get("/api/dashboard/teacher").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ linked: false });
    });

    it("returns real stats once linked", async () => {
      const batch = await makeCourseAndBatch();
      const { staff, faculty } = await makeTeacherWithFaculty("A", batch.id);
      const student = await prisma.student.create({
        data: { tenantId: TENANT_ID, studentCode: "INS-2026-0001", fullName: "Student One", phone: "8000000001" },
      });
      await prisma.enrollment.create({ data: { studentId: student.id, batchId: batch.id, status: "active" } });

      const token = tokenFor({ staffId: staff.id, role: "teacher", centerId: null, tenantId: TENANT_ID, facultyId: faculty.id });
      const res = await request(app).get("/api/dashboard/teacher").set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.linked).toBe(true);
      expect(res.body.totalBatches).toBe(1);
      expect(res.body.totalStudents).toBe(1);
      expect(res.body.classesToday).toHaveLength(1);
    });

    it("403s for a non-teacher role, same guard as other role-restricted routes", async () => {
      const passwordHash = await bcrypt.hash("secret123", 10);
      const admin = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9444444444", email: "admin2@x.test", role: "admin", passwordHash },
      });
      const token = tokenFor({ staffId: admin.id, role: "admin", centerId: null, tenantId: TENANT_ID });

      const res = await request(app).get("/api/dashboard/teacher").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/faculty/:id — linking a Staff login", () => {
    async function makeAdminToken() {
      const passwordHash = await bcrypt.hash("secret123", 10);
      const admin = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9555555555", email: "admin3@x.test", role: "admin", passwordHash },
      });
      return tokenFor({ staffId: admin.id, role: "admin", centerId: null, tenantId: TENANT_ID });
    }

    it("lets an admin link an unlinked teacher Staff account to a Faculty profile", async () => {
      const passwordHash = await bcrypt.hash("secret123", 10);
      const teacher = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Free Teacher", phone: "9666666666", email: "free@teacher.test", role: "teacher", passwordHash },
      });
      const faculty = await prisma.faculty.create({
        data: {
          tenantId: TENANT_ID, employeeCode: "FAC-FREE", fullName: "Free Teacher",
          phone: "9777777777", email: "free-faculty@x.test", qualification: "M.Sc", joiningDate: new Date(),
        },
      });
      const adminToken = await makeAdminToken();

      const res = await request(app)
        .patch(`/api/faculty/${faculty.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ staffId: teacher.id });

      expect(res.status).toBe(200);
      expect(res.body.staffId).toBe(teacher.id);
    });

    it("409s linking a Staff already linked to another Faculty profile", async () => {
      const batch = await makeCourseAndBatch();
      const { staff } = await makeTeacherWithFaculty("Link", batch.id);
      const otherFaculty = await prisma.faculty.create({
        data: {
          tenantId: TENANT_ID, employeeCode: "FAC-OTHER", fullName: "Other Faculty",
          phone: "9888888888", email: "other-faculty@x.test", qualification: "M.Sc", joiningDate: new Date(),
        },
      });
      const adminToken = await makeAdminToken();

      const res = await request(app)
        .patch(`/api/faculty/${otherFaculty.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ staffId: staff.id });

      expect(res.status).toBe(409);
      expect(res.body.field).toBe("staffId");
    });

    it("404s linking a staffId that doesn't reference a teacher-role Staff in this tenant", async () => {
      const passwordHash = await bcrypt.hash("secret123", 10);
      const notATeacher = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Front Desk Only", phone: "9999999998", email: "fd2@x.test", role: "frontdesk", passwordHash },
      });
      const faculty = await prisma.faculty.create({
        data: {
          tenantId: TENANT_ID, employeeCode: "FAC-FD", fullName: "FD Faculty",
          phone: "9999999997", email: "fd-faculty@x.test", qualification: "M.Sc", joiningDate: new Date(),
        },
      });
      const adminToken = await makeAdminToken();

      const res = await request(app)
        .patch(`/api/faculty/${faculty.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ staffId: notATeacher.id });

      expect(res.status).toBe(404);
      expect(res.body.field).toBe("staffId");
    });
  });
});
