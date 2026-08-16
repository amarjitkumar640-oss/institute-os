import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import multer from "multer";
import { prisma } from "../../lib/prisma";
import { normalizePhone } from "@institute-os/shared";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { deletePhoto, uploadPhoto, getSignedPhotoUrl, s3PathPrefix } from "../../lib/s3";

export const staffRouter = Router();

const SALT_ROUNDS = 10;
const upload = multer({ storage: multer.memoryStorage() });

// ── GET /api/staff — list all staff with their center assignments ──────────────
staffRouter.get("/", requireAuth, requirePermission("staff", "read"), async (req, res) => {
  const staff = await prisma.staff.findMany({
    where: { tenantId: req.auth!.tenantId },
    select: {
      id:        true,
      fullName:  true,
      email:     true,
      phone:     true,
      username:  true,
      photoUrl:  true,
      roles:     true,
      isActive:  true,
      createdAt: true,
      linkedFaculty: { select: { id: true } },
      centerAssignments: {
        select: {
          roles:  true,
          center: { select: { id: true, name: true } },
        },
        orderBy: { center: { name: "asc" } },
      },
    },
    orderBy: { fullName: "asc" },
  });
  // photoUrl is a bare S3 key in the DB — resolve to a short-lived signed
  // URL here, same convention as Student.photoUrl (withPhotoUrl/withPhotoUrls
  // in students.service.ts).
  const withSignedPhotos = await Promise.all(
    staff.map(async (s) => ({
      ...s,
      photoUrl: s.photoUrl ? await getSignedPhotoUrl(s.photoUrl) : null,
    }))
  );
  res.json(withSignedPhotos);
});

// ── Self-service profile photo — any authenticated staff member manages only
// their own (req.auth!.staffId), never someone else's. No requirePermission
// gate: this isn't the "staff" management screen, it's "edit my own profile,"
// the same way changing your own password isn't gated by staff.edit either. ──
staffRouter.post("/me/photo", requireAuth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing photo file" });
  const staff = await prisma.staff.findUnique({ where: { id: req.auth!.staffId } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  if (staff.photoUrl) {
    // Best-effort — don't let a missing/already-gone S3 object block replacing it.
    await deletePhoto(staff.photoUrl).catch(() => {});
  }

  const key = `${s3PathPrefix(staff.tenantId, req.auth!.centerId ?? null)}/staff/${staff.id}/${Date.now()}-${req.file.originalname}`;
  await uploadPhoto(key, req.file.buffer, req.file.mimetype);
  await prisma.staff.update({ where: { id: staff.id }, data: { photoUrl: key } });
  res.json({ photoUrl: await getSignedPhotoUrl(key) });
});

staffRouter.delete("/me/photo", requireAuth, async (req, res) => {
  const staff = await prisma.staff.findUnique({ where: { id: req.auth!.staffId } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  if (staff.photoUrl) {
    await deletePhoto(staff.photoUrl).catch(() => {});
  }
  await prisma.staff.update({ where: { id: staff.id }, data: { photoUrl: null } });
  res.json({ ok: true });
});

// ── POST /api/staff — create a new staff account ──────────────────────────────
const createStaffSchema = z.object({
  fullName: z.string().min(1),
  email:    z.string().email(),
  phone:    z.string().min(6),
  username: z.string().min(3).optional(),
  roles:    z.array(z.enum(["admin", "teacher", "frontdesk"])).min(1),
  password: z.string().min(6),
});

staffRouter.post("/", requireAuth, requirePermission("staff", "write"), async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fullName, email, phone, username, roles, password } = parsed.data;
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
    data:   { fullName, email, phone: normalizedPhone, username, roles, passwordHash, tenantId },
    select: { id: true, fullName: true, email: true, phone: true, username: true, roles: true, isActive: true, createdAt: true },
  });
  res.status(201).json(staff);
});

// ── PATCH /api/staff/:id — update name / phone / username / role / active status ──
const updateStaffSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone:    z.string().min(6).optional(),
  username: z.string().min(3).nullable().optional(),
  roles:    z.array(z.enum(["admin", "teacher", "frontdesk"])).min(1).optional(),
  isActive: z.boolean().optional(),
});

staffRouter.patch("/:id", requireAuth, requirePermission("staff", "edit"), async (req, res) => {
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
    select: { id: true, fullName: true, email: true, phone: true, username: true, roles: true, isActive: true, createdAt: true },
  });
  res.json(updated);
});

// ── POST /api/staff/:id/reset-password — set a new password ──────────────────
staffRouter.post("/:id/reset-password", requireAuth, requirePermission("staff", "edit"), async (req, res) => {
  const staff = await prisma.staff.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  const schema = z.object({ password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const passwordHash = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
  await prisma.staff.update({ where: { id: req.params.id }, data: { passwordHash } });
  res.json({ ok: true });
});
