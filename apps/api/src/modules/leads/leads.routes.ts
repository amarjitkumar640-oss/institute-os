import { Router } from "express";
import { Prisma } from "@prisma/client";
import { convertLeadSchema, createLeadSchema } from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/role";
import { validateBody } from "../../middleware/validate";
import { BatchFullError } from "../enrollments/enrollments.service";
import { convertLead } from "./leads.service";

export const leadsRouter = Router();

leadsRouter.get("/", requireAuth, requireRole("admin", "frontdesk"), async (_req, res) => {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
  res.json(leads);
});

leadsRouter.post(
  "/",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(createLeadSchema),
  async (req, res) => {
    const lead = await prisma.lead.create({ data: req.body });
    res.status(201).json(lead);
  }
);

leadsRouter.post(
  "/:id/convert",
  requireAuth,
  requireRole("admin", "frontdesk"),
  validateBody(convertLeadSchema),
  async (req, res) => {
    try {
      const result = await convertLead(prisma, req.params.id, req.body);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof BatchFullError) {
        return res.status(409).json({ error: err.message });
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return res.status(404).json({ error: "Lead not found" });
      }
      if (err instanceof Error && err.message === "Lead already converted") {
        return res.status(409).json({ error: err.message });
      }
      throw err;
    }
  }
);
