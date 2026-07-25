import { prisma } from "../lib/prisma";
import { resetDb } from "./setup";
import { createEnrollment, BatchFullError } from "../modules/enrollments/enrollments.service";
import { convertLead } from "../modules/leads/leads.service";

async function ensureSscCategory() {
  return prisma.examCategory.upsert({
    where:  { key: "ssc" },
    update: {},
    create: { key: "ssc", label: "SSC" },
  });
}

async function makeCourseAndBatch(capacity: number) {
  const examCategory = await ensureSscCategory();
  const course = await prisma.course.create({
    data: { name: "SSC CGL Foundation", examCategoryId: examCategory.id, durationMonths: 6, defaultFee: 10000 },
  });
  return prisma.batch.create({
    data: {
      courseId: course.id,
      name: "SSC-Morning-A",
      capacity,
      startDate: new Date(),
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
}

describe("enrollment capacity", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("rejects enrollment once batch is at capacity", async () => {
    const batch = await makeCourseAndBatch(1);
    const s1 = await prisma.student.create({
      data: { studentCode: "INS-2026-0001", fullName: "Student One", phone: "1" },
    });
    const s2 = await prisma.student.create({
      data: { studentCode: "INS-2026-0002", fullName: "Student Two", phone: "2" },
    });

    await prisma.$transaction((tx) => createEnrollment(tx, s1.id, batch.id));

    await expect(
      prisma.$transaction((tx) => createEnrollment(tx, s2.id, batch.id))
    ).rejects.toBeInstanceOf(BatchFullError);
  });

  it("rejects a duplicate (student, batch) enrollment", async () => {
    const batch = await makeCourseAndBatch(5);
    const student = await prisma.student.create({
      data: { studentCode: "INS-2026-0003", fullName: "Student Three", phone: "3" },
    });

    await prisma.$transaction((tx) => createEnrollment(tx, student.id, batch.id));

    await expect(
      prisma.$transaction((tx) => createEnrollment(tx, student.id, batch.id))
    ).rejects.toThrow();
  });
});

describe("lead conversion", () => {
  beforeEach(resetDb);
  afterAll(async () => prisma.$disconnect());

  it("creates exactly one student + one enrollment and marks the lead converted", async () => {
    const batch = await makeCourseAndBatch(10);
    const examCategory = await ensureSscCategory();
    const lead = await prisma.lead.create({
      data: { name: "Lead Name", phone: "9", targetExamId: examCategory.id, source: "walk-in" },
    });

    const result = await convertLead(prisma, lead.id, {
      batchId: batch.id,
    });

    expect(result.student.fullName).toBe("Lead Name");
    expect(await prisma.student.count()).toBe(1);
    expect(await prisma.enrollment.count()).toBe(1);

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.status).toBe("converted");
    expect(updatedLead.convertedStudentId).toBe(result.student.id);
  });
});
