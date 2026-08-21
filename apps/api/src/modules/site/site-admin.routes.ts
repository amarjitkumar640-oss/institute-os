import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { uploadPhoto, deletePhoto } from "../../lib/s3";
import { getSiteTenant, serializeHighlight, serializeHighlights } from "./site.service";

export const siteAdminRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

// This content belongs to one specific tenant (SITE_TENANT_SLUG) regardless
// of who's logged in — an admin from any OTHER tenant is still a valid
// admin, just not one who should be able to touch this tenant's marketing
// site, so every handler below checks req.auth!.tenantId against it too.
siteAdminRouter.use(requireAuth, requireRole("admin"));

// ── GET /highlights — every item, including inactive ones, for the admin list ─
siteAdminRouter.get("/highlights", async (req, res) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });

  const highlights = await prisma.siteHighlight.findMany({
    where:   { tenantId: tenant.id },
    orderBy: { publishedAt: "desc" },
  });
  res.json(await serializeHighlights(highlights));
});

const createSchema = z.object({
  type:        z.enum(["announcement", "result", "gallery"]),
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // Sent as a JSON string in multipart form fields, not real JSON body —
  // parsed below rather than through validateBody, same reasoning as any
  // multipart route that mixes text fields with a file.
  meta:        z.string().optional(),
  isActive:    z.string().optional(), // "true" / "false" over multipart
});

siteAdminRouter.post("/highlights", upload.single("image"), async (req, res) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, title, description, meta, isActive } = parsed.data;

  let imageKey: string | null = null;
  if (req.file) {
    imageKey = `${tenant.id}/site/${type}/${Date.now()}-${req.file.originalname}`;
    await uploadPhoto(imageKey, req.file.buffer, req.file.mimetype);
  }

  const highlight = await prisma.siteHighlight.create({
    data: {
      tenantId:    tenant.id,
      type,
      title,
      description: description ?? null,
      imageUrl:    imageKey,
      meta:        meta ? JSON.parse(meta) : undefined,
      isActive:    isActive === undefined ? true : isActive === "true",
    },
  });
  res.status(201).json(await serializeHighlight(highlight));
});

const updateSchema = createSchema.partial();

siteAdminRouter.patch("/highlights/:id", upload.single("image"), async (req, res) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });

  const existing = await prisma.siteHighlight.findFirst({ where: { id: req.params.id, tenantId: tenant.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, title, description, meta, isActive } = parsed.data;

  let imageKey = existing.imageUrl;
  if (req.file) {
    if (existing.imageUrl) await deletePhoto(existing.imageUrl).catch(() => {});
    imageKey = `${tenant.id}/site/${type ?? existing.type}/${Date.now()}-${req.file.originalname}`;
    await uploadPhoto(imageKey, req.file.buffer, req.file.mimetype);
  }

  const highlight = await prisma.siteHighlight.update({
    where: { id: existing.id },
    data: {
      ...(type !== undefined ? { type } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(meta !== undefined ? { meta: JSON.parse(meta) } : {}),
      ...(isActive !== undefined ? { isActive: isActive === "true" } : {}),
      imageUrl: imageKey,
    },
  });
  res.json(await serializeHighlight(highlight));
});

siteAdminRouter.delete("/highlights/:id", async (req, res) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.status(503).json({ error: "SITE_TENANT_SLUG is not configured" });
  if (req.auth!.tenantId !== tenant.id) return res.status(403).json({ error: "Not available for your institute" });

  const existing = await prisma.siteHighlight.findFirst({ where: { id: req.params.id, tenantId: tenant.id } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (existing.imageUrl) await deletePhoto(existing.imageUrl).catch(() => {});
  await prisma.siteHighlight.delete({ where: { id: existing.id } });
  res.json({ deleted: true });
});
