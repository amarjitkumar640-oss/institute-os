import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";

export const staffRouter = Router();

const SALT_ROUNDS = 10;

// ── GET /api/staff — list all staff with their center assignments ──────────────
staffRouter.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  const staff = await prisma.staff.findMany({
    select: {
      id:        true,
      fullName:  true,
      email:     true,
      phone:     true,
      role:      true,
      isActive:  true,
      createdAt: true,
      centerAssignments: {
        select: {
          role:   true,
          center: { select: { id: true, name: true } },
        },
        orderBy: { center: { name: "asc" } },
      },
    },
    orderBy: { fullName: "asc" },
  });
  res.json(staff);
});

// ── POST /api/staff — create a new staff account ──────────────────────────────
const createStaffSchema = z.object({
  fullName: z.string().min(1),
  email:    z.string().email(),
  phone:    z.string().min(6),
  role:     z.enum(["admin", "teacher", "frontdesk"]),
  password: z.string().min(6),
});

staffRouter.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fullName, email, phone, role, password } = parsed.data;

  const existing = await prisma.staff.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "A staff member with this email already exists." });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const staff = await prisma.staff.create({
    data:   { fullName, email, phone, role, passwordHash },
    select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
  });
  res.status(201).json(staff);
});

// ── PATCH /api/staff/:id — update name / phone / global role / active status ──
const updateStaffSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone:    z.string().min(6).optional(),
  role:     z.enum(["admin", "teacher", "frontdesk"]).optional(),
  isActive: z.boolean().optional(),
});

staffRouter.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const staff = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  // Prevent an admin from deactivating themselves
  if (req.params.id === req.auth!.staffId && req.body.isActive === false) {
    return res.status(400).json({ error: "You cannot deactivate your own account." });
  }

  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.staff.update({
    where:  { id: req.params.id },
    data:   parsed.data,
    select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true, createdAt: true },
  });
  res.json(updated);
});

// ── POST /api/staff/:id/reset-password — set a new password ──────────────────
staffRouter.post("/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  const staff = await prisma.staff.findUnique({ where: { id: req.params.id } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  const schema = z.object({ password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const passwordHash = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
  await prisma.staff.update({ where: { id: req.params.id }, data: { passwordHash } });
  res.json({ ok: true });
});
