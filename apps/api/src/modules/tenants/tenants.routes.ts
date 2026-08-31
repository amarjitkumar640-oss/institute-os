import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { resolveLogoUrl, uploadPhoto, getSignedPhotoUrl, deletePhoto } from "../../lib/s3";

export const tenantsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// A stored logoUrl is either an object key in our own private bucket
// (uploaded below) or a plain external URL — see resolveLogoUrl's own
// comment. Only a key we own should ever be deleted from the bucket.
function isOwnedLogoKey(logoUrl: string): boolean {
  return !logoUrl.startsWith("http://") && !logoUrl.startsWith("https://");
}

// ── GET /api/tenants/:tenantId/public — unauthenticated org lookup ────────────
// Called once at app launch (the tenant is baked into the build), before any
// login screen renders, so the app can show the right name/branding/login
// method immediately. No password/identifier involved — just a known ID.
tenantsRouter.get("/:tenantId/public", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.tenantId } });
  if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });
  res.json({
    name:        tenant.name,
    loginMethod: tenant.loginMethod,
    branding: {
      primary:    tenant.brandPrimary,
      secondary:  tenant.brandSecondary,
      accent:     tenant.brandAccent,
      background: tenant.brandBackground,
      headerBg:   tenant.brandHeaderBg,
      logoUrl:    await resolveLogoUrl(tenant.logoUrl),
    },
  });
});

// ── GET /api/tenants/slug/:slug/public — same lookup, keyed by slug ───────────
// Used by the web portal's runtime tenant-resolution entry route (/org/:slug)
// so ONE deployed web build can serve every tenant — the tenant is resolved
// from the URL at runtime instead of being baked in at build time like the
// mobile app. Includes `id` (the :tenantId/public route above doesn't, since
// its callers already know the id — this route's whole job is to hand it out).
tenantsRouter.get("/slug/:slug/public", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: req.params.slug } });
  if (!tenant || !tenant.isActive) return res.status(404).json({ error: "Organization not found" });
  res.json({
    id:          tenant.id,
    name:        tenant.name,
    loginMethod: tenant.loginMethod,
    branding: {
      primary:    tenant.brandPrimary,
      secondary:  tenant.brandSecondary,
      accent:     tenant.brandAccent,
      background: tenant.brandBackground,
      headerBg:   tenant.brandHeaderBg,
      logoUrl:    await resolveLogoUrl(tenant.logoUrl),
    },
  });
});

// ── GET /api/tenants/me — current tenant's branding + name ────────────────────
tenantsRouter.get("/me", requireAuth, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  res.json({
    id:          tenant.id,
    name:        tenant.name,
    slug:        tenant.slug,
    loginMethod: tenant.loginMethod,
    branding: {
      primary:    tenant.brandPrimary,
      secondary:  tenant.brandSecondary,
      accent:     tenant.brandAccent,
      background: tenant.brandBackground,
      headerBg:   tenant.brandHeaderBg,
      logoUrl:    await resolveLogoUrl(tenant.logoUrl),
    },
    classReminderMinutes: tenant.classReminderMinutes,
    overdueGraceDays:     tenant.overdueGraceDays,
    legalName:            tenant.legalName,
    registeredAddress:    tenant.registeredAddress,
    gstin:                tenant.gstin,
    stateCode:            tenant.stateCode,
    bankDetails:          tenant.bankDetails,
  });
});

// ── PATCH /api/tenants/me/settings — admin sets branding, logo, login method ──
const settingsSchema = z.object({
  primary:              z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  secondary:            z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  accent:               z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  background:           z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  headerBg:             z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  logoUrl:              z.string().nullable().optional(),
  loginMethod:          z.enum(["phone", "email_username"]).optional(),
  classReminderMinutes: z.number().int().min(1).max(120).optional(),
  overdueGraceDays:     z.number().int().min(0).max(60).optional(),
  // Legal/billing details, shown on generated sponsor invoices.
  legalName:            z.string().max(200).nullable().optional(),
  registeredAddress:    z.string().max(500).nullable().optional(),
  gstin:                z.string().max(20).nullable().optional(),
  stateCode:            z.string().max(2).nullable().optional(),
  bankDetails:          z.string().max(500).nullable().optional(),
});

tenantsRouter.patch("/me/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const tenant = await prisma.tenant.update({
    where: { id: req.auth!.tenantId },
    data: {
      ...(parsed.data.primary              !== undefined ? { brandPrimary:         parsed.data.primary              } : {}),
      ...(parsed.data.secondary            !== undefined ? { brandSecondary:       parsed.data.secondary            } : {}),
      ...(parsed.data.accent               !== undefined ? { brandAccent:          parsed.data.accent               } : {}),
      ...(parsed.data.background           !== undefined ? { brandBackground:      parsed.data.background           } : {}),
      ...(parsed.data.headerBg             !== undefined ? { brandHeaderBg:        parsed.data.headerBg             } : {}),
      ...(parsed.data.logoUrl              !== undefined ? { logoUrl:              parsed.data.logoUrl              } : {}),
      ...(parsed.data.loginMethod          !== undefined ? { loginMethod:          parsed.data.loginMethod          } : {}),
      ...(parsed.data.classReminderMinutes !== undefined ? { classReminderMinutes: parsed.data.classReminderMinutes } : {}),
      ...(parsed.data.overdueGraceDays     !== undefined ? { overdueGraceDays:     parsed.data.overdueGraceDays     } : {}),
      ...(parsed.data.legalName            !== undefined ? { legalName:            parsed.data.legalName            } : {}),
      ...(parsed.data.registeredAddress    !== undefined ? { registeredAddress:    parsed.data.registeredAddress    } : {}),
      ...(parsed.data.gstin                !== undefined ? { gstin:                parsed.data.gstin                } : {}),
      ...(parsed.data.stateCode            !== undefined ? { stateCode:            parsed.data.stateCode            } : {}),
      ...(parsed.data.bankDetails          !== undefined ? { bankDetails:          parsed.data.bankDetails          } : {}),
    },
  });

  res.json({
    primary:              tenant.brandPrimary,
    secondary:            tenant.brandSecondary,
    accent:               tenant.brandAccent,
    background:           tenant.brandBackground,
    headerBg:             tenant.brandHeaderBg,
    logoUrl:              await resolveLogoUrl(tenant.logoUrl),
    loginMethod:          tenant.loginMethod,
    classReminderMinutes: tenant.classReminderMinutes,
    overdueGraceDays:     tenant.overdueGraceDays,
    legalName:            tenant.legalName,
    registeredAddress:    tenant.registeredAddress,
    gstin:                tenant.gstin,
    stateCode:            tenant.stateCode,
    bankDetails:          tenant.bankDetails,
  });
});

// ── POST /api/tenants/me/logo — admin uploads/replaces the logo image ─────────
tenantsRouter.post("/me/logo", requireAuth, requireRole("admin"), upload.single("logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing logo file" });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  if (tenant.logoUrl && isOwnedLogoKey(tenant.logoUrl)) {
    await deletePhoto(tenant.logoUrl).catch(() => {});
  }

  const key = `tenants/${tenant.id}/logo-${Date.now()}-${req.file.originalname}`;
  await uploadPhoto(key, req.file.buffer, req.file.mimetype);
  await prisma.tenant.update({ where: { id: tenant.id }, data: { logoUrl: key } });
  res.json({ logoUrl: await getSignedPhotoUrl(key) });
});

// ── DELETE /api/tenants/me/logo — admin removes the logo ──────────────────────
tenantsRouter.delete("/me/logo", requireAuth, requireRole("admin"), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  if (tenant.logoUrl && isOwnedLogoKey(tenant.logoUrl)) {
    await deletePhoto(tenant.logoUrl).catch(() => {});
  }
  await prisma.tenant.update({ where: { id: tenant.id }, data: { logoUrl: null } });
  res.json({ ok: true });
});
