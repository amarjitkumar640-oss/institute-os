import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";

export const examCategoriesRouter = Router();

// ── GET /api/exam-categories — active exam categories (SSC, Banking, ...) ──
examCategoriesRouter.get("/", requireAuth, async (req, res) => {
  const categories = await prisma.examCategory.findMany({
    where:   { tenantId: req.auth!.tenantId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  res.json(categories);
});
