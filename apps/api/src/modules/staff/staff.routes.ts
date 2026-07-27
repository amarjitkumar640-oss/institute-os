import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { normalizePhone } from "@institute-os/shared";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";

export const staffRouter = Router();

const SALT_ROUNDS = 10;

// ── GET /api/staff — list all staff with their center assignments ──────────────
staffRouter.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const staff = await prisma.staff.findMany({
    where: { tenantId: req.auth!.tenantId },
    select: {
      id:        true,
      fullName:  true,
      email:     true,
      phone:     true,
      username:  true,
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
  username: z.string().min(3).optional(),
  role:     z.enum(["admin", "teacher", "frontdesk"]),
  password: z.string().min(6),
});

staffRouter.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fullName, email, phone, username, role, password } = parsed.data;
  const normalizedPhone = normalizePhone(phone);
  const tenantId = req.auth!.tenantId;

  const [existingEmail, existingPhone, existingUsername] = await Promise.all([
    prisma.staff.findUnique({ where: { email } }),
    prisma.staff.findFirst({ where: { tenantId, phone: normalizedPhone } }),
    username ? prisma.staff.findFirst({ where: { tenantId, username } }) : Promise.resolve(null),
  ]);
  if (existingEmail) return res.status(409).json({ error: "A staff member with this email already exists." });
  if (existingPhone) return res.status(409).json({ error: "A staff member with this phone number already exists." });
  if (existingUsername) return res.status(409).json({ error: "A staff member with this username already exists." });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const staff = await prisma.staff.create({
    data:   { fullName, email, phone: normalizedPhone, username, role, passwordHash, tenantId },
    select: { id: true, fullName: true, email: true, phone: true, username: true, role: true, isActive: true, createdAt: true },
  });
  res.status(201).json(staff);
});

// ── PATCH /api/staff/:id — update name / phone / username / role / active status ──
const updateStaffSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone:    z.string().min(6).optional(),
  username: z.string().min(3).nullable().optional(),
  role:     z.enum(["admin", "teacher", "frontdesk"]).optional(),
  isActive: z.boolean().optional(),
});

staffRouter.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const staff = await prisma.staff.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  // Prevent an admin from deactivating themselves
  if (req.params.id === req.auth!.staffId && req.body.isActive === false) {
    return res.status(400).json({ error: "You cannot deactivate your own account." });
  }

  const parsed = updateStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tenantId = req.auth!.tenantId;
  const data = { ...parsed.data };
  if (data.phone !== undefined) {
    data.phone = normalizePhone(data.phone);
    const existingPhone = await prisma.staff.findFirst({ where: { tenantId, phone: data.phone } });
    if (existingPhone && existingPhone.id !== req.params.id) {
      return res.status(409).json({ error: "A staff member with this phone number already exists." });
    }
  }
  if (data.username) {
    const existingUsername = await prisma.staff.findFirst({ where: { tenantId, username: data.username } });
    if (existingUsername && existingUsername.id !== req.params.id) {
      return res.status(409).json({ error: "A staff member with this username already exists." });
    }
  }

  const updated = await prisma.staff.update({
    where:  { id: req.params.id },
    data,
    select: { id: true, fullName: true, email: true, phone: true, username: true, role: true, isActive: true, createdAt: true },
  });
  res.json(updated);
});

// ── POST /api/staff/:id/reset-password — set a new password ──────────────────
staffRouter.post("/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  const staff = await prisma.staff.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  const schema = z.object({ password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const passwordHash = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
  await prisma.staff.update({ where: { id: req.params.id }, data: { passwordHash } });
  res.json({ ok: true });
});
