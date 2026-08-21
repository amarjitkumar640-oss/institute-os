import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { runClassReminderSweep, runOverdueInstallmentSweep } from "../modules/notifications/sweep";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const TODAY = new Date().toISOString().slice(0, 10);

async function makeTenant(overrides: Partial<{ classReminderMinutes: number; overdueGraceDays: number }> = {}) {
  return prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: { classReminderMinutes: overrides.classReminderMinutes ?? 15, overdueGraceDays: overrides.overdueGraceDays ?? 0 },
    create: {
      id: TENANT_ID, name: "Test Institute", slug: "test-institute",
      classReminderMinutes: overrides.classReminderMinutes ?? 15,
      overdueGraceDays:     overrides.overdueGraceDays ?? 0,
    },
  });
}

async function makeCourseAndBatch() {
  const course = await prisma.course.create({
    data: { tenantId: TENANT_ID, name: "SSC CGL Foundation", durationMonths: 6, defaultFee: 10000 },
  });
  return prisma.batch.create({
    data: {
      tenantId: TENANT_ID, courseId: course.id, name: "SSC-Morning-A", capacity: 50,
      startDate: new Date(), endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
}

async function makeLinkedTeacher(batchId: string) {
  const passwordHash = await bcrypt.hash("secret123", 10);
  const staff = await prisma.staff.create({
    data: { tenantId: TENANT_ID, fullName: "Teacher", phone: "9500000000", email: "teacher@x.test", roles: ["teacher"], passwordHash },
  });
  return prisma.faculty.create({
    data: {
      tenantId: TENANT_ID, employeeCode: "FAC-SWEEP", fullName: "Teacher",
      phone: staff.phone, email: staff.email, qualification: "M.Sc", joiningDate: new Date(),
      staffId: staff.id,
    },
  }).then((faculty) => ({ staff, faculty }));
}

function timeInMinutes(fromNow: number): string {
  return new Date(Date.now() + fromNow * 60_000).toTimeString().slice(0, 5);
}

describe("notification sweeps", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  describe("class reminder sweep", () => {
    it("notifies the linked teacher for a session starting within the reminder window", async () => {
      await makeTenant({ classReminderMinutes: 15 });
      const batch = await makeCourseAndBatch();
      const { staff, faculty } = await makeLinkedTeacher(batch.id);

      const session = await prisma.classSession.create({
        data: {
          batchId: batch.id, facultyId: faculty.id,
          scheduledDate: new Date(`${TODAY}T00:00:00.000Z`),
          startTime: timeInMinutes(10), endTime: timeInMinutes(70),
          status: "scheduled",
        },
      });

      await runClassReminderSweep(prisma);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id, type: "class_reminder" } });
      expect(notifications).toHaveLength(1);

      const updated = await prisma.classSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(updated.reminderSentAt).not.toBeNull();
    });

    it("does not re-notify on a second sweep for the same session", async () => {
      await makeTenant({ classReminderMinutes: 15 });
      const batch = await makeCourseAndBatch();
      const { staff, faculty } = await makeLinkedTeacher(batch.id);

      await prisma.classSession.create({
        data: {
          batchId: batch.id, facultyId: faculty.id,
          scheduledDate: new Date(`${TODAY}T00:00:00.000Z`),
          startTime: timeInMinutes(5), endTime: timeInMinutes(65),
          status: "scheduled",
        },
      });

      await runClassReminderSweep(prisma);
      await runClassReminderSweep(prisma);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id, type: "class_reminder" } });
      expect(notifications).toHaveLength(1);
    });

    it("does not notify for a session outside the reminder window", async () => {
      await makeTenant({ classReminderMinutes: 15 });
      const batch = await makeCourseAndBatch();
      const { staff, faculty } = await makeLinkedTeacher(batch.id);

      await prisma.classSession.create({
        data: {
          batchId: batch.id, facultyId: faculty.id,
          scheduledDate: new Date(`${TODAY}T00:00:00.000Z`),
          startTime: timeInMinutes(120), endTime: timeInMinutes(180),
          status: "scheduled",
        },
      });

      await runClassReminderSweep(prisma);

      const notifications = await prisma.notification.findMany({ where: { recipientId: staff.id, type: "class_reminder" } });
      expect(notifications).toHaveLength(0);
    });
  });

  describe("overdue installment sweep", () => {
    async function makeOverdueInstallment(daysOverdue: number) {
      const batch = await makeCourseAndBatch();
      const student = await prisma.student.create({
        data: { tenantId: TENANT_ID, studentCode: "INS-0001", fullName: "Overdue Student", phone: "8000000001" },
      });
      const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, batchId: batch.id } });
      const schedule = await prisma.studentFeeSchedule.create({
        data: { enrollmentId: enrollment.id, totalFee: 5000, effectiveFee: 5000 },
      });
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() - daysOverdue);
      return prisma.scheduleInstallment.create({
        data: { scheduleId: schedule.id, sortOrder: 0, label: "Installment 1", plannedAmount: 5000, dueDate, status: "pending" },
      });
    }

    it("notifies admin+frontdesk (default routing) for an installment overdue past the grace period", async () => {
      await makeTenant({ overdueGraceDays: 0 });
      const passwordHash = await bcrypt.hash("secret123", 10);
      const admin = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9600000000", email: "admin@x.test", roles: ["admin"], passwordHash },
      });
      const inst = await makeOverdueInstallment(5);

      await runOverdueInstallmentSweep(prisma);

      const notifications = await prisma.notification.findMany({ where: { recipientId: admin.id, type: "installment_overdue" } });
      expect(notifications).toHaveLength(1);

      const updated = await prisma.scheduleInstallment.findUniqueOrThrow({ where: { id: inst.id } });
      expect(updated.overdueNotifiedAt).not.toBeNull();
    });

    it("respects the tenant's grace period — not yet overdue", async () => {
      await makeTenant({ overdueGraceDays: 10 });
      const passwordHash = await bcrypt.hash("secret123", 10);
      const admin = await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9700000000", email: "admin2@x.test", roles: ["admin"], passwordHash },
      });
      await makeOverdueInstallment(3); // 3 days overdue, but grace period is 10

      await runOverdueInstallmentSweep(prisma);

      const notifications = await prisma.notification.findMany({ where: { recipientId: admin.id, type: "installment_overdue" } });
      expect(notifications).toHaveLength(0);
    });

    it("does not re-notify on a second sweep for the same installment", async () => {
      await makeTenant({ overdueGraceDays: 0 });
      await prisma.staff.create({
        data: { tenantId: TENANT_ID, fullName: "Admin", phone: "9800000000", email: "admin3@x.test", roles: ["admin"], passwordHash: await bcrypt.hash("secret123", 10) },
      });
      await makeOverdueInstallment(5);

      await runOverdueInstallmentSweep(prisma);
      await runOverdueInstallmentSweep(prisma);

      const total = await prisma.notification.count({ where: { type: "installment_overdue" } });
      expect(total).toBe(1);
    });
  });
});
