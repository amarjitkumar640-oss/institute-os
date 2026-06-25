import { Router } from "express";
import { createBatchSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";

export const batchesRouter = Router();

batchesRouter.get("/", requireAuth, async (_req, res) => {
  const batches = await prisma.batch.findMany({ include: { course: true } });
  res.json(batches);
});

batchesRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(createBatchSchema),
  async (req, res) => {
    const batch = await prisma.batch.create({ data: req.body });
    res.status(201).json(batch);
  }
);
