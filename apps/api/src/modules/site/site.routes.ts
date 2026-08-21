import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { getSiteTenant, serializeHighlights } from "./site.service";
import type { SiteContentType } from "@prisma/client";

export const siteRouter = Router();

const VALID_TYPES: SiteContentType[] = ["announcement", "result", "gallery"];

// ── GET /api/site/highlights — public feed for the marketing site ────────────
// Unauthenticated, read-only, active items only. ?type= filters to one kind
// (announcement/result/gallery); omitted returns all three, newest first.
siteRouter.get("/highlights", async (req, res) => {
  const tenant = await getSiteTenant();
  if (!tenant) return res.json([]); // SITE_TENANT_SLUG unset — nothing to show, not an error

  const type = req.query.type as string | undefined;
  if (type && !VALID_TYPES.includes(type as SiteContentType)) {
    return res.status(400).json({ error: "Invalid type" });
  }

  const highlights = await prisma.siteHighlight.findMany({
    where:   { tenantId: tenant.id, isActive: true, ...(type ? { type: type as SiteContentType } : {}) },
    orderBy: { publishedAt: "desc" },
  });
  res.json(await serializeHighlights(highlights));
});
