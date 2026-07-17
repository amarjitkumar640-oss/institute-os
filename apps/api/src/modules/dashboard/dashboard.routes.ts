import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { centerFilter } from "../../lib/centerFilter";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireAuth, async (req, res) => {
  const cFilter = centerFilter(req);
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
    prisma.course.count(),   // global
    prisma.faculty.count({ where: { ...cFilter, isActive: true } }),
    prisma.subject.count(),  // global
    prisma.enrollment.count({
      where: {
        status: "active",
        ...(cFilter.centerId ? { batch: { centerId: cFilter.centerId } } : {}),
      },
    }),
    prisma.student.aggregate({ where: cFilter, _sum: { amountPaid: true } }),

    prisma.enrollment.findMany({
      where: {
        status: "active",
        ...(cFilter.centerId ? { batch: { centerId: cFilter.centerId } } : {}),
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
        ...(cFilter.centerId ? { batch: { centerId: cFilter.centerId } } : {}),
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
  if (!cFilter.centerId) {
    const centers = await prisma.center.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
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
    feesCollected: Number(feesAgg._sum.amountPaid ?? 0),
    monthlyEnrollments,
    recentActivity: activityItems,
    ...(perCenter !== undefined ? { perCenter } : {}),
  });
});
