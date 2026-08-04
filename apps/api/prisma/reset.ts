import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetToFresh() {
  console.log("🧹  Clearing all demo data — keeping tenant, centers, admin accounts, exam categories, document types.\n");

  const n = await prisma.$transaction(async (tx) => {
    // Notifications
    const notifications        = await tx.notification.deleteMany();
    const routingRules         = await tx.notificationRoutingRule.deleteMany();

    // Payments
    const payments             = await tx.paymentTransaction.deleteMany();
    const installments         = await tx.scheduleInstallment.deleteMany();
    const feeSchedules         = await tx.studentFeeSchedule.deleteMany();

    // Schedule
    const classSessions        = await tx.classSession.deleteMany();
    const classSlots           = await tx.classSlot.deleteMany();

    // Fee templates
    const templateLines        = await tx.templateLine.deleteMany();
    const feeTemplates         = await tx.courseFeeTemplate.deleteMany();

    // Students
    const studentDocs          = await tx.studentDocument.deleteMany();
    const enrollments          = await tx.enrollment.deleteMany();
    const leads                = await tx.lead.deleteMany();
    const students             = await tx.student.deleteMany();

    // Batches
    const batches              = await tx.batch.deleteMany();

    // Faculty (join table first)
    const facultySubjects      = await tx.facultySubject.deleteMany();
    const faculty              = await tx.faculty.deleteMany();

    // Courses (join table first)
    const courseCategories     = await tx.courseExamCategory.deleteMany();
    const courses              = await tx.course.deleteMany();

    // Subjects (join table first)
    const subjectCategories    = await tx.subjectExamCategory.deleteMany();
    const subjects             = await tx.subject.deleteMany();

    // Non-admin staff — keep admins so login still works
    const nonAdminStaff = await tx.staff.findMany({
      where: { role: { not: "admin" } },
      select: { id: true },
    });
    const nonAdminIds = nonAdminStaff.map((s) => s.id);
    let staffCenterLinks = { count: 0 };
    let staffAccounts    = { count: 0 };
    if (nonAdminIds.length > 0) {
      staffCenterLinks = await tx.centerStaff.deleteMany({ where: { staffId: { in: nonAdminIds } } });
      staffAccounts    = await tx.staff.deleteMany({ where: { id: { in: nonAdminIds } } });
    }

    return {
      notifications:    notifications.count,
      routingRules:     routingRules.count,
      payments:         payments.count,
      installments:     installments.count,
      feeSchedules:     feeSchedules.count,
      classSessions:    classSessions.count,
      classSlots:       classSlots.count,
      templateLines:    templateLines.count,
      feeTemplates:     feeTemplates.count,
      studentDocs:      studentDocs.count,
      enrollments:      enrollments.count,
      leads:            leads.count,
      students:         students.count,
      batches:          batches.count,
      facultySubjects:  facultySubjects.count,
      faculty:          faculty.count,
      courseCategories: courseCategories.count,
      courses:          courses.count,
      subjectCategories:subjectCategories.count,
      subjects:         subjects.count,
      staffCenterLinks: staffCenterLinks.count,
      staffAccounts:    staffAccounts.count,
    };
  });

  const rows = [
    ["Notifications",           n.notifications],
    ["Notification rules",      n.routingRules],
    ["Payment transactions",    n.payments],
    ["Schedule installments",   n.installments],
    ["Fee schedules",           n.feeSchedules],
    ["Class sessions",          n.classSessions],
    ["Class slots",             n.classSlots],
    ["Template lines",          n.templateLines],
    ["Fee templates",           n.feeTemplates],
    ["Student documents",       n.studentDocs],
    ["Enrollments",             n.enrollments],
    ["Leads",                   n.leads],
    ["Students",                n.students],
    ["Batches",                 n.batches],
    ["Faculty-subject links",   n.facultySubjects],
    ["Faculty",                 n.faculty],
    ["Course-category links",   n.courseCategories],
    ["Courses",                 n.courses],
    ["Subject-category links",  n.subjectCategories],
    ["Subjects",                n.subjects],
    ["Non-admin center links",  n.staffCenterLinks],
    ["Non-admin staff",         n.staffAccounts],
  ] as const;

  for (const [label, count] of rows) {
    console.log(`  ${label.padEnd(24)} ${count}`);
  }

  // Report kept admin accounts so the user knows what login still works
  const admins = await prisma.staff.findMany({
    where: { role: "admin" },
    select: { fullName: true, phone: true, email: true, username: true },
  });

  console.log("\n✅  Done. Admin accounts kept:");
  for (const a of admins) {
    const id = [a.phone, a.email, a.username].filter(Boolean).join("  /  ");
    console.log(`  • ${a.fullName}  (${id})`);
  }
}

resetToFresh()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
