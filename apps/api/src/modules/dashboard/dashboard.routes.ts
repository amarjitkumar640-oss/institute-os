import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { assignedCenterIds } from "../../lib/centerFilter";
import { listFacultySessions, listTodaySessions } from "../schedule/schedule.service";

export const dashboardRouter = Router();

// ── Teacher-scoped dashboard ────────────────────────────────────────────────
// Separate route (not a branch of "/") so the existing admin/frontdesk
// dashboard response is completely untouched.
// Deliberately left on requireRole, not requirePermission — "dashboard" is
// excluded from the permission grid entirely (no create/edit/delete concept,
// always open to any authenticated staff). Which dashboard PAYLOAD SHAPE a
// caller gets back is a content decision keyed on role, not a screen-access
// decision — same reasoning as DashboardPage.tsx's/DashboardScreen.tsx's own
// client-side teacher-vs-admin fork, which also stays a role check.
dashboardRouter.get("/teacher", requireAuth, requireRole("teacher"), async (req, res) => {
  const facultyId = req.auth!.facultyId;
  if (!facultyId) {
    return res.json({ linked: false as const });
  }

  // Prefer the client-supplied date (device local date) so IST users don't see
  // UTC yesterday's schedule before 05:30 AM. Falls back to UTC today.
  const rawDate = typeof req.query.date === "string" ? req.query.date : "";
  const todayStr = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  const [todaySessions, activeSlots] = await Promise.all([
    listFacultySessions(prisma, facultyId, req.auth!.tenantId, { from: todayStr, to: todayStr }),
    prisma.classSlot.findMany({
      where: { facultyId, isActive: true, batch: { tenantId: req.auth!.tenantId } },
      select: { batchId: true, batch: { select: { id: true, name: true, course: { select: { name: true } } } } },
      distinct: ["batchId"],
    }),
  ]);

  const batchIds = activeSlots.map((s) => s.batchId);
  const [totalStudents, perBatchCounts] = batchIds.length
    ? await Promise.all([
        prisma.enrollment.count({ where: { status: "active", batchId: { in: batchIds } } }),
        prisma.enrollment.groupBy({ by: ["batchId"], where: { status: "active", batchId: { in: batchIds } }, _count: true }),
      ])
    : [0, []];
  const studentCountByBatch = new Map(perBatchCounts.map((c) => [c.batchId, c._count]));

  res.json({
    linked: true as const,
    classesToday: todaySessions,
    myBatches: activeSlots.map((s) => ({
      id: s.batch.id,
      name: s.batch.name,
      courseName: s.batch.course.name,
      studentCount: studentCountByBatch.get(s.batchId) ?? 0,
    })),
    totalBatches: activeSlots.length,
    totalStudents,
  });
});

dashboardRouter.get("/", requireAuth, async (req, res) => {
  const ids = await assignedCenterIds(req);
  const cFilter = { tenantId: req.auth!.tenantId, centerId: { in: ids } };
  // Same "applicant's own preference, not a staff assignment" reasoning as
  // applicationCenterFilter() in admissionApplications.routes.ts — null centerId
  // rows must stay visible alongside this staff's assigned centers.
  const appCenterFilter = { tenantId: cFilter.tenantId, OR: [{ centerId: null }, { centerId: { in: ids } }] };
  const now = new Date();
  const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const som = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Same UTC-date-string convention listTodaySessions() already uses.
  const todayStr   = now.toISOString().slice(0, 10);
  const todayStart = new Date(todayStr + "T00:00:00.000Z");
  const todayEnd   = new Date(todayStr + "T23:59:59.999Z");

  const corePromise = Promise.all([
    prisma.student.count({ where: cFilter }),
    prisma.batch.count({ where: cFilter }),
    prisma.batch.count({ where: { ...cFilter, status: "running" } }),
    prisma.course.count({ where: { tenantId: cFilter.tenantId } }),
    prisma.faculty.count({ where: { ...cFilter, isActive: true } }),
    prisma.subject.count({ where: { tenantId: cFilter.tenantId } }),
    prisma.enrollment.count({
      where: {
        status: "active",
        batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId },
      },
    }),
    prisma.paymentTransaction.aggregate({
      where: {
        type: "payment",
        schedule: {
          enrollment: {
            batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId },
          },
        },
      },
      _sum: { amount: true },
    }),

    prisma.enrollment.findMany({
      where: {
        status: "active",
        batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId },
      },
      orderBy: { enrolledOn: "desc" },
      take: 5,
      include: {
        student: { select: { fullName: true, coursePreference: true } },
        batch:   { select: { name: true } },
      },
    }),

    prisma.faculty.findMany({
      where:   cFilter,
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        fullName:  true,
        createdAt: true,
        teachingSubjects: {
          take: 1,
          include: { subject: { select: { name: true } } },
        },
      },
    }),

    prisma.enrollment.findMany({
      where: {
        enrolledOn: { gte: eightMonthsAgo },
        batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId },
      },
      select: { enrolledOn: true },
    }),

    // Same query getFeeSummary() uses for its overdueCount (fees.service.ts).
    prisma.scheduleInstallment.count({
      where: {
        status: "overdue",
        schedule: { enrollment: { batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId } } },
      },
    }),

    // "new" leads nobody has followed up on in 2+ days — same center scoping as leadsRouter's list.
    prisma.lead.count({
      where: { ...cFilter, status: "new", createdAt: { lt: fortyEightHoursAgo } },
    }),

    prisma.admissionApplication.count({
      where: { ...appCenterFilter, status: "pending" },
    }),

    // Batch has no createdAt — startDate is the best available "new this month" signal.
    prisma.batch.count({
      where: { ...cFilter, startDate: { gte: som } },
    }),

    prisma.paymentTransaction.aggregate({
      where: {
        type: "payment",
        paidAt: { gte: som },
        schedule: { enrollment: { batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId } } },
      },
      _sum: { amount: true },
    }),

    prisma.paymentTransaction.aggregate({
      where: {
        type: "payment",
        paidAt: { gte: prevMonthStart, lt: som },
        schedule: { enrollment: { batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId } } },
      },
      _sum: { amount: true },
    }),

    prisma.lead.findMany({
      where: cFilter,
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { name: true, source: true, createdAt: true },
    }),

    prisma.paymentTransaction.findMany({
      where: {
        type: "payment",
        schedule: { enrollment: { batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId } } },
      },
      orderBy: { paidAt: "desc" },
      take: 3,
      select: {
        amount: true,
        paidAt: true,
        schedule: { select: { enrollment: { select: { student: { select: { fullName: true } } } } } },
      },
    }),
  ]);

  // ── New real-data dashboard widgets — a second, parallel batch rather than
  //    growing the array above, purely for readability. Both batches are
  //    awaited together below, so this adds zero latency vs. one flat array.
  const extraPromise = Promise.all([
    prisma.admissionApplication.count({ where: { ...appCenterFilter, status: "admitted" } }),
    prisma.admissionApplication.count({ where: { ...appCenterFilter, status: "rejected" } }),

    listTodaySessions(prisma, req.auth!.tenantId, ids),

    prisma.admissionApplication.findMany({
      where: appCenterFilter,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, fullName: true, status: true, createdAt: true,
        coursePreference: true,
        course: { select: { name: true } },
      },
    }),

    // Same filter shape as the existing overdueFeesCount query above (deliberately
    // reuses stored status:"overdue" to stay consistent with that exact metric on
    // this same dashboard — the "compute live from dueDate" rule in root CLAUDE.md
    // governs the notification sweep, not this display list).
    prisma.scheduleInstallment.findMany({
      where: {
        status: "overdue",
        schedule: { enrollment: { batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId } } },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      select: {
        dueDate: true, plannedAmount: true, paidAmount: true, waivedAmount: true,
        schedule: {
          select: {
            enrollmentId: true,
            enrollment: { select: { student: { select: { fullName: true } } } },
          },
        },
      },
    }),

    // Attendance — "marked" counts are separate from "present" counts so the
    // client can tell "nobody's taken attendance yet today" (marked === 0) apart
    // from "attendance taken, everyone's absent" (marked > 0, present === 0).
    // Same reasoning as feesTrendUpFromZero above: a 0 that means "no data" must
    // never render the same as a 0 that means "checked, and it's zero."
    prisma.sessionAttendance.count({
      where: {
        classSession: {
          scheduledDate: { gte: todayStart, lte: todayEnd },
          batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId },
        },
      },
    }),
    prisma.sessionAttendance.count({
      where: {
        status: "present",
        classSession: {
          scheduledDate: { gte: todayStart, lte: todayEnd },
          batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId },
        },
      },
    }),
    prisma.facultyAttendance.count({
      where: { date: todayStart, faculty: { tenantId: cFilter.tenantId, centerId: { in: ids } } },
    }),
    prisma.facultyAttendance.count({
      where: { status: "present", date: todayStart, faculty: { tenantId: cFilter.tenantId, centerId: { in: ids } } },
    }),

    // Today-only variants of existing "total"/"this month" metrics, for the
    // summary banner — same filter shapes as their lifetime/monthly counterparts.
    prisma.admissionApplication.count({
      where: { ...appCenterFilter, createdAt: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.paymentTransaction.aggregate({
      where: {
        type: "payment",
        paidAt: { gte: todayStart, lte: todayEnd },
        schedule: { enrollment: { batch: { tenantId: cFilter.tenantId, centerId: cFilter.centerId } } },
      },
      _sum: { amount: true },
    }),
  ]);

  const [
    [
      totalStudents,
      totalBatches,
      activeBatches,
      totalCourses,
      totalFaculty,
      totalSubjects,
      totalEnrollments,
      feesAgg,
      recentEnrollments,
      recentFaculty,
      rawMonthlyEnrollments,
      overdueFeesCount,
      staleLeadsCount,
      pendingApplicationsCount,
      newBatchesThisMonth,
      feesThisMonthAgg,
      feesLastMonthAgg,
      recentLeads,
      recentPayments,
    ],
    [
      admittedCount,
      rejectedCount,
      todaySessionsRaw,
      recentAdmissionsRaw,
      topOverdueFeesRaw,
      sessionAttendanceMarkedCount,
      sessionAttendancePresentCount,
      facultyAttendanceMarkedCount,
      facultyAttendancePresentCount,
      admissionsToday,
      feesCollectedTodayAgg,
    ],
  ] = await Promise.all([corePromise, extraPromise]);

  // ── Monthly enrollment chart ───────────────────────────────────────────────
  const monthMap: Record<string, number> = {};
  rawMonthlyEnrollments.forEach((e) => {
    const key = `${e.enrolledOn.getFullYear()}-${String(e.enrolledOn.getMonth() + 1).padStart(2, "0")}`;
    monthMap[key] = (monthMap[key] ?? 0) + 1;
  });

  const monthlyEnrollments = Array.from({ length: 8 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - 7 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: d.toLocaleString("en-IN", { month: "short" }),
      count: monthMap[key] ?? 0,
    };
  });

  // ── Recent activity feed ──────────────────────────────────────────────────
  const activityItems = [
    ...recentEnrollments.map((e) => ({
      type:  "enrollment" as const,
      title: `${e.student.fullName} enrolled`,
      sub:   e.batch.name,
      time:  e.enrolledOn.toISOString(),
    })),
    ...recentFaculty.map((f) => ({
      type:  "faculty" as const,
      title: `Faculty added: ${f.fullName}`,
      sub:   f.teachingSubjects[0]?.subject.name ?? "—",
      time:  f.createdAt.toISOString(),
    })),
    ...recentLeads.map((l) => ({
      type:  "lead" as const,
      title: `New lead: ${l.name}`,
      sub:   l.source,
      time:  l.createdAt.toISOString(),
    })),
    ...recentPayments.map((p) => ({
      type:  "payment" as const,
      title: `Payment received`,
      sub:   `${p.schedule.enrollment.student.fullName} · ₹${Number(p.amount).toLocaleString("en-IN")}`,
      time:  p.paidAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  // ── Trend deltas (existing headline numbers stay lifetime totals — these
  // are additional context, not replacements) ───────────────────────────────
  const feesThisMonth = Number(feesThisMonthAgg._sum.amount ?? 0);
  const feesLastMonth = Number(feesLastMonthAgg._sum.amount ?? 0);
  const feesTrendPercent = feesLastMonth > 0
    ? Math.round(((feesThisMonth - feesLastMonth) / feesLastMonth) * 100)
    : null;
  // feesLastMonth === 0 makes the percentage undefined (divide-by-zero) even though
  // feesThisMonth > 0 is a real increase — flagged separately so the client can still
  // show a directional indicator instead of hiding the trend entirely.
  const feesTrendUpFromZero = feesLastMonth === 0 && feesThisMonth > 0;
  const enrollmentsThisMonth = monthlyEnrollments.at(-1)?.count ?? 0;

  const studentAttendanceTodayPercent = sessionAttendanceMarkedCount > 0
    ? Math.round((sessionAttendancePresentCount / sessionAttendanceMarkedCount) * 100)
    : null;
  const facultyAttendanceToday = facultyAttendanceMarkedCount > 0
    ? { present: facultyAttendancePresentCount, marked: facultyAttendanceMarkedCount, total: totalFaculty }
    : null;
  // Absent counts are null (not 0) until someone has actually marked attendance —
  // same "no data yet" vs. "checked, zero" distinction as the percent/summary above.
  const studentsAbsentToday = sessionAttendanceMarkedCount > 0
    ? sessionAttendanceMarkedCount - sessionAttendancePresentCount
    : null;
  const facultyAbsentToday = facultyAttendanceMarkedCount > 0
    ? facultyAttendanceMarkedCount - facultyAttendancePresentCount
    : null;
  const feesCollectedToday = Number(feesCollectedTodayAgg._sum.amount ?? 0);

  // ── Shape the 4 new real-data widgets ─────────────────────────────────────
  const applicationStatusCounts = {
    pending:  pendingApplicationsCount,
    admitted: admittedCount,
    rejected: rejectedCount,
  };

  // listTodaySessions() has no internal `take` — capture the true count before
  // slicing to a preview list, so the stat tile isn't undercounted past 5.
  const todaySessionsCount = todaySessionsRaw.length;

  const todaySessions = todaySessionsRaw.slice(0, 5).map((s) => ({
    id:          s.id,
    subjectName: s.subject?.name ?? null,
    facultyName: s.faculty?.fullName ?? null,
    batchId:     s.batch.id,
    batchName:   s.batch.name,
    startTime:   s.startTime,
    endTime:     s.endTime,
  }));

  const recentAdmissions = recentAdmissionsRaw.map((a) => ({
    id:         a.id,
    fullName:   a.fullName,
    courseName: a.course?.name ?? a.coursePreference ?? "—",
    status:     a.status,
    createdAt:  a.createdAt.toISOString(),
  }));

  // Outstanding formula matches fees.service.ts's getFeeSummary() "pending" aggregate
  // exactly (plannedAmount - paidAmount - waivedAmount; lateFee is intentionally
  // excluded — that field only enters the excess-payment-redistribution flow
  // elsewhere, not this "how much is owed" display figure).
  const topOverdueFees = topOverdueFeesRaw.map((f) => ({
    enrollmentId: f.schedule.enrollmentId,
    studentName:  f.schedule.enrollment.student.fullName,
    outstanding:  Number(f.plannedAmount) - Number(f.paidAmount) - Number(f.waivedAmount),
    dueDate:      f.dueDate.toISOString(),
  }));

  // ── Per-center breakdown (only in all-centers mode) ───────────────────────
  let perCenter: Array<{ id: string; name: string; students: number; batches: number; enrollments: number }> | undefined;
  if (!req.auth?.centerId) {
    // Scoped to this staff's own assigned centers (`ids`), not every center
    // in the tenant — otherwise this breakdown would leak centers they were
    // never assigned to even though the totals above are correctly scoped.
    const centers = await prisma.center.findMany({ where: { id: { in: ids }, isActive: true }, orderBy: { name: "asc" } });
    perCenter = await Promise.all(
      centers.map(async (c) => {
        const [students, batches, enrollments] = await Promise.all([
          prisma.student.count({ where: { centerId: c.id } }),
          prisma.batch.count({ where: { centerId: c.id } }),
          prisma.enrollment.count({ where: { status: "active", batch: { centerId: c.id } } }),
        ]);
        return { id: c.id, name: c.name, students, batches, enrollments };
      })
    );
  }

  return res.json({
    totalStudents,
    totalBatches,
    activeBatches,
    totalCourses,
    totalFaculty,
    totalSubjects,
    totalEnrollments,
    feesCollected: Number(feesAgg._sum.amount ?? 0),
    monthlyEnrollments,
    recentActivity: activityItems,
    overdueFeesCount,
    staleLeadsCount,
    pendingApplicationsCount,
    enrollmentsThisMonth,
    newBatchesThisMonth,
    feesTrendPercent,
    feesTrendUpFromZero,
    applicationStatusCounts,
    todaySessionsCount,
    todaySessions,
    recentAdmissions,
    topOverdueFees,
    studentAttendanceTodayPercent,
    facultyAttendanceToday,
    admissionsToday,
    feesCollectedToday,
    studentsAbsentToday,
    facultyAbsentToday,
    ...(perCenter !== undefined ? { perCenter } : {}),
  });
});
