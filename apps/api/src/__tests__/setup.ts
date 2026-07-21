import { prisma } from "../lib/prisma";

export async function resetDb() {
  await prisma.paymentTransaction.deleteMany();
  await prisma.scheduleInstallment.deleteMany();
  await prisma.studentFeeSchedule.deleteMany();
  await prisma.templateLine.deleteMany();
  await prisma.courseFeeTemplate.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.student.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.course.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.subject.deleteMany();
}
