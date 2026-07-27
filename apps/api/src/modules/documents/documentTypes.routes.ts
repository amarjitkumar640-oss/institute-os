import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

export const documentTypesRouter = Router();

// ── GET /api/document-types — active document types staff can upload for a student ──
documentTypesRouter.get("/", requireAuth, async (req, res) => {
  const types = await prisma.documentType.findMany({
    where:   { tenantId: req.auth!.tenantId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  res.json(types);
});
