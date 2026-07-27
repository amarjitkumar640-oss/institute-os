import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";

export const centersRouter = Router();

// ── GET /api/centers — centers assigned to the current staff member ───────────
centersRouter.get("/", requireAuth, async (req, res) => {
  const assignments = await prisma.centerStaff.findMany({
    where:   { staffId: req.auth!.staffId, center: { isActive: true, tenantId: req.auth!.tenantId } },
    include: { center: { select: { id: true, name: true, address: true, phone: true } } },
    orderBy: { center: { name: "asc" } },
  });
  res.json(
    assignments.map((a) => ({
      id:      a.center.id,
      name:    a.center.name,
      address: a.center.address,
      phone:   a.center.phone,
      role:    a.role,
    }))
  );
});

// ── GET /api/centers/assignable — every active center in this tenant, id/name only ──
// Used by the "pick a center for this record" fallback shown when a create
// action fails because the session has no center pinned (all-centers mode).
// Deliberately NOT scoped to the caller's own CenterStaff assignments like
// GET / above — an all-centers-mode admin/frontdesk may have zero assignments
// yet still needs to be able to attach a new record to any center that exists
// in their own tenant (but never another tenant's centers).
centersRouter.get("/assignable", requireAuth, async (req, res) => {
  const centers = await prisma.center.findMany({
    where:   { tenantId: req.auth!.tenantId, isActive: true },
    orderBy: { name: "asc" },
    select:  { id: true, name: true },
  });
  res.json(centers);
});

// ── GET /api/centers/all — all centers in this tenant (admin only, for management UI) ──
centersRouter.get("/all", requireAuth, requireRole("admin"), async (req, res) => {
  const centers = await prisma.center.findMany({
    where:   { tenantId: req.auth!.tenantId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { students: true, batches: true, staff: true } },
    },
  });
  res.json(
    centers.map((c) => ({
      id:        c.id,
      name:      c.name,
      address:   c.address,
      phone:     c.phone,
      isActive:  c.isActive,
      createdAt: c.createdAt,
      counts:    { students: c._count.students, batches: c._count.batches, staff: c._count.staff },
    }))
  );
});

// ── POST /api/centers — create a new center ───────────────────────────────────
const createCenterSchema = z.object({
  name:    z.string().min(1),
  address: z.string().optional(),
  phone:   z.string().optional(),
});

centersRouter.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createCenterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const center = await prisma.center.create({ data: { ...parsed.data, tenantId: req.auth!.tenantId } });

  // Auto-assign the creating admin to this center
  await prisma.centerStaff.create({
    data: { centerId: center.id, staffId: req.auth!.staffId, role: "admin" },
  });

  res.status(201).json(center);
});

// ── PATCH /api/centers/:id — update center details ────────────────────────────
centersRouter.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const center = await prisma.center.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!center) return res.status(404).json({ error: "Center not found" });

  const schema = z.object({
    name:     z.string().min(1).optional(),
    address:  z.string().optional(),
    phone:    z.string().optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.center.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

// ── GET /api/centers/:id/staff — list staff assigned to a center ──────────────
centersRouter.get("/:id/staff", requireAuth, requireRole("admin"), async (req, res) => {
  const center = await prisma.center.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!center) return res.status(404).json({ error: "Center not found" });

  const assignments = await prisma.centerStaff.findMany({
    where:   { centerId: req.params.id },
    include: { staff: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } } },
    orderBy: { staff: { fullName: "asc" } },
  });
  res.json(assignments.map((a) => ({
    id:       a.id,
    role:     a.role,
    staffId:  a.staffId,
    fullName: a.staff.fullName,
    email:    a.staff.email,
    phone:    a.staff.phone,
    isActive: a.staff.isActive,
  })));
});

// ── POST /api/centers/:id/staff — assign a staff member to a center ───────────
centersRouter.post("/:id/staff", requireAuth, requireRole("admin"), async (req, res) => {
  const center = await prisma.center.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!center) return res.status(404).json({ error: "Center not found" });

  const schema = z.object({
    staffId: z.string().uuid(),
    role:    z.enum(["admin", "teacher", "frontdesk"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const staff = await prisma.staff.findFirst({ where: { id: parsed.data.staffId, tenantId: req.auth!.tenantId } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  const assignment = await prisma.centerStaff.upsert({
    where:  { centerId_staffId: { centerId: req.params.id, staffId: parsed.data.staffId } },
    update: { role: parsed.data.role },
    create: { centerId: req.params.id, staffId: parsed.data.staffId, role: parsed.data.role },
  });
  res.status(201).json(assignment);
});

// ── DELETE /api/centers/:id/staff/:staffId — remove a staff from a center ─────
centersRouter.delete("/:id/staff/:staffId", requireAuth, requireRole("admin"), async (req, res) => {
  const center = await prisma.center.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!center) return res.status(404).json({ error: "Center not found" });

  const assignment = await prisma.centerStaff.findUnique({
    where: { centerId_staffId: { centerId: req.params.id, staffId: req.params.staffId } },
  });
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });

  await prisma.centerStaff.delete({
    where: { centerId_staffId: { centerId: req.params.id, staffId: req.params.staffId } },
  });
  res.json({ deleted: true });
});
