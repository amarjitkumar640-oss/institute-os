import { Router, type Request } from "express";
import { rejectAdmissionApplicationSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { assignedCenterIds } from "../../lib/centerFilter";

export const admissionApplicationsRouter = Router();

const STATUSES = ["pending", "rejected", "admitted"] as const;

// Like centerFilter, but an application's centerId is the applicant's own
// preference (nullable — e.g. a multi-center tenant with no center list
// shown yet, or a submission that predates the center picker), not an
// assignment staff control. A plain `centerId: { in: [...] }` filter would
// silently exclude those null rows for everyone, so they're always visible
// alongside whatever centers this staff member is assigned to — mirrors the
// tenant-wide notification fallback for the same "no preference" case.
async function applicationCenterFilter(req: Request) {
  const centerIds = await assignedCenterIds(req);
  return { OR: [{ centerId: null }, { centerId: { in: centerIds } }] };
}

admissionApplicationsRouter.get("/", requireAuth, requirePermission("admission-applications", "read"), async (req, res) => {
  const status = STATUSES.includes(req.query.status as any) ? (req.query.status as (typeof STATUSES)[number]) : undefined;

  const applications = await prisma.admissionApplication.findMany({
    where:   { tenantId: req.auth!.tenantId, ...(await applicationCenterFilter(req)), ...(status ? { status } : {}) },
    include: {
      course: { select: { id: true, name: true } },
      center: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(applications);
});

admissionApplicationsRouter.get(
  "/:id",
  requireAuth,
  requirePermission("admission-applications", "read"),
  validateUuidParam(),
  async (req, res) => {
    const application = await prisma.admissionApplication.findFirst({
      where:   { id: req.params.id, tenantId: req.auth!.tenantId, ...(await applicationCenterFilter(req)) },
      include: {
        course:     { select: { id: true, name: true } },
        center:     { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, fullName: true } },
        student:    { select: { id: true, studentCode: true, fullName: true } },
      },
    });
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json(application);
  }
);

admissionApplicationsRouter.post(
  "/:id/reject",
  requireAuth,
  requirePermission("admission-applications", "edit"),
  validateUuidParam(),
  validateBody(rejectAdmissionApplicationSchema),
  async (req, res) => {
    const application = await prisma.admissionApplication.findFirst({
      where: { id: req.params.id, tenantId: req.auth!.tenantId, ...(await applicationCenterFilter(req)) },
    });
    if (!application) return res.status(404).json({ error: "Application not found" });
    if (application.status !== "pending") {
      return res.status(409).json({ error: `Application already ${application.status}` });
    }

    const updated = await prisma.admissionApplication.update({
      where: { id: application.id },
      data: {
        status:          "rejected",
        rejectionReason: req.body.reason,
        reviewedById:    req.auth!.staffId,
        reviewedAt:      new Date(),
      },
    });
    res.json(updated);
  }
);
