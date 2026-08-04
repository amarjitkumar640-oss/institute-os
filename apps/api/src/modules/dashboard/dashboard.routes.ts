import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { assignedCenterIds } from "../../lib/centerFilter";
import { listFacultySessions } from "../schedule/schedule.service";

export const dashboardRouter = Router();

// ── Teacher-scoped dashboard ────────────────────────────────────────────────
// Separate route (not a branch of "/") so the existing admin/frontdesk
// dashboard response is completely untouched.
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
      select: { batchId: true, batch: { select: { id: true, name: true } } },
      distinct: ["batchId"],
    }),
  ]);

  const batchIds = activeSlots.map((s) => s.batchId);
  const totalStudents = batchIds.length
    ? await prisma.enrollment.count({ where: { status: "active", batchId: { in: batchIds } } })
    : 0;

  res.json({
    linked: true as const,
    classesToday: todaySessions,
    myBatches: activeSlots.map((s) => s.batch),
    totalBatches: activeSlots.length,
    totalStudents,
  });
});

dashboardRouter.get("/", requireAuth, async (req, res) => {
  const ids = await assignedCenterIds(req);
  const cFilter = { tenantId: req.auth!.tenantId, centerId: { in: ids } };
  const now = new Date();
  const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 1);

  const [
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
  ] = await Promise.all([
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
  ]);

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
  ]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

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
    ...(perCenter !== undefined ? { perCenter } : {}),
  });
});
