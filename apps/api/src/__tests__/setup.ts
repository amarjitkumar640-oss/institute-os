import { prisma } from "../lib/prisma";

export async function resetDb() {
  await prisma.feePayment.deleteMany();
  await prisma.feePlan.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.student.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.course.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.subject.deleteMany();
}
