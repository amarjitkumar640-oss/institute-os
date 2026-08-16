import { NextFunction, Request, Response, Router } from "express";
import { submitAdmissionApplicationSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validate";
import { rateLimit } from "../../lib/rateLimit";
import { notifyByRoleCenterAware } from "../notifications/notification.service";

export const admissionsPublicRouter = Router();

// Bots that auto-fill every field on a form will fill this one too — real
// users never see it (hidden via CSS on the public page). Checked before
// validateBody, which would otherwise silently strip an unknown field.
function rejectHoneypot(req: Request, res: Response, next: NextFunction) {
  if (req.body?.website) return res.status(400).json({ error: "Invalid submission" });
  next();
}

// ── GET /api/public/:tenantSlug/courses — course list for the apply form ─────
// Unauthenticated. Branding/name for the same page comes from the existing
// GET /api/tenants/slug/:slug/public (used by the /org/:slug web entry flow) —
// this endpoint only adds what that one doesn't have: the course list.
admissionsPublicRouter.get("/:tenantSlug/courses", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.tenantSlug } });
  if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });

  const courses = await prisma.course.findMany({
    where:  { tenantId: tenant.id },
    select: {
      id: true,
      name: true,
      durationMonths: true,
      examCategories: { include: { examCategory: { select: { id: true, key: true, label: true } } } },
    },
    orderBy: { name: "asc" },
  });

  res.json(courses.map(({ examCategories, ...c }) => ({
    ...c,
    examCategories: examCategories.map((ec) => ec.examCategory),
  })));
});

// ── GET /api/public/:tenantSlug/centers — center list for the apply form ─────
// So the applicant can indicate which branch they'd like to attend — a
// preference frontdesk can still change at admit time, not a binding
// assignment.
admissionsPublicRouter.get("/:tenantSlug/centers", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.tenantSlug } });
  if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });

  const centers = await prisma.center.findMany({
    where:   { tenantId: tenant.id, isActive: true },
    select:  { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  });
  res.json(centers);
});

// ── POST /api/public/:tenantSlug/admission-applications — self-service submit ─
admissionsPublicRouter.post(
  "/:tenantSlug/admission-applications",
  rateLimit({ windowMs: 60_000, max: 5 }),
  rejectHoneypot,
  validateBody(submitAdmissionApplicationSchema),
  async (req, res) => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.tenantSlug } });
    if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });

    const { tcAccepted: _tcAccepted, centerId, ...applicationData } = req.body;

    if (centerId) {
      const center = await prisma.center.findFirst({ where: { id: centerId, tenantId: tenant.id, isActive: true } });
      if (!center) return res.status(400).json({ error: "Invalid center" });
    }

    const application = await prisma.admissionApplication.create({
      data: { ...applicationData, centerId: centerId ?? null, tenantId: tenant.id, tcAcceptedAt: new Date() },
    });

    // Admins always get this tenant-wide; frontdesk is scoped to the
    // applicant's preferred center when they gave one, so a multi-center
    // institute's frontdesk staff only hear about applications meant for
    // their own center.
    await notifyByRoleCenterAware(
      prisma,
      tenant.id,
      "new_application",
      "New admission application",
      `${application.fullName} applied for admission`,
      { applicationId: application.id },
      centerId ?? null,
    ).catch(console.error);

    res.status(201).json({ id: application.id });
  }
);
