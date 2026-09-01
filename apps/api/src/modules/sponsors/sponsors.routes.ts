import { Router } from "express";
import multer from "multer";
import {
  createSponsorSchema, updateSponsorSchema,
  createSponsorshipContractSchema, updateSponsorshipContractSchema,
  createMilestoneSchema, markMilestoneReceivedSchema, generateMonthlyMilestonesSchema,
} from "@institute-os/shared";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permission";
import { validateBody, validateUuidParam } from "../../middleware/validate";
import { uploadPhoto, deletePhoto, getSignedPhotoUrl, s3PathPrefix } from "../../lib/s3";
import * as sponsorsService from "./sponsors.service";
import { generateInvoice } from "./invoice.service";

export const sponsorsRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── Sponsors ─────────────────────────────────────────────────────────────────

sponsorsRouter.get("/", requireAuth, requirePermission("sponsors", "read"), async (req, res) => {
  res.json(await sponsorsService.listSponsors(prisma, req.auth!.tenantId));
});

sponsorsRouter.get("/:id", requireAuth, requirePermission("sponsors", "read"), validateUuidParam("id"), async (req, res) => {
  const sponsor = await sponsorsService.getSponsor(prisma, req.params.id, req.auth!.tenantId);
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
  res.json(sponsor);
});

sponsorsRouter.post("/", requireAuth, requirePermission("sponsors", "write"), validateBody(createSponsorSchema), async (req, res) => {
  res.status(201).json(await sponsorsService.createSponsor(prisma, req.auth!.tenantId, req.body));
});

sponsorsRouter.patch("/:id", requireAuth, requirePermission("sponsors", "edit"), validateUuidParam("id"), validateBody(updateSponsorSchema), async (req, res) => {
  try {
    res.json(await sponsorsService.updateSponsor(prisma, req.params.id, req.auth!.tenantId, req.body));
  } catch (err) {
    if (err instanceof Error && err.message === "SPONSOR_NOT_FOUND") return res.status(404).json({ error: "Sponsor not found" });
    throw err;
  }
});

// ── Contracts ────────────────────────────────────────────────────────────────
// Read a batch's contract via GET /api/batches/:id — see batches.routes.ts's
// analogous /:id/offers pattern; the contract lookup lives here instead,
// scoped by batchId query-style path for consistency with this module.

sponsorsRouter.get("/by-batch/:batchId", requireAuth, requirePermission("sponsors", "read"), validateUuidParam("batchId"), async (req, res) => {
  const contract = await sponsorsService.getContractForBatch(prisma, req.params.batchId, req.auth!.tenantId);
  res.json(contract);
});

sponsorsRouter.post("/contracts", requireAuth, requirePermission("sponsors", "write"), validateBody(createSponsorshipContractSchema), async (req, res) => {
  try {
    res.status(201).json(await sponsorsService.createContract(prisma, req.auth!.tenantId, req.body));
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "BATCH_NOT_FOUND") return res.status(400).json({ error: "Batch not found" });
      if (err.message === "SPONSOR_NOT_FOUND") return res.status(400).json({ error: "Sponsor not found" });
      if (err.message === "BATCH_ALREADY_SPONSORED") return res.status(409).json({ error: "This batch already has a sponsorship contract" });
    }
    throw err;
  }
});

sponsorsRouter.patch("/contracts/:id", requireAuth, requirePermission("sponsors", "edit"), validateUuidParam("id"), validateBody(updateSponsorshipContractSchema), async (req, res) => {
  try {
    res.json(await sponsorsService.updateContract(prisma, req.params.id, req.auth!.tenantId, req.body));
  } catch (err) {
    if (err instanceof Error && err.message === "CONTRACT_NOT_FOUND") return res.status(404).json({ error: "Contract not found" });
    throw err;
  }
});

sponsorsRouter.post(
  "/contracts/:id/document",
  requireAuth,
  requirePermission("sponsors", "edit"),
  validateUuidParam("id"),
  upload.single("document"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing document file" });
    const contract = await prisma.sponsorshipContract.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    if (contract.documentUrl) await deletePhoto(contract.documentUrl).catch(() => {});

    const key = `${s3PathPrefix(req.auth!.tenantId, null)}/sponsorship-contracts/${contract.id}/${Date.now()}-${req.file.originalname}`;
    await uploadPhoto(key, req.file.buffer, req.file.mimetype);
    const updated = await prisma.sponsorshipContract.update({ where: { id: contract.id }, data: { documentUrl: key } });
    res.json({ ...updated, documentUrl: await getSignedPhotoUrl(key) });
  },
);

// ── Milestones ───────────────────────────────────────────────────────────────

sponsorsRouter.post(
  "/contracts/:contractId/milestones",
  requireAuth,
  requirePermission("sponsors", "write"),
  validateUuidParam("contractId"),
  validateBody(createMilestoneSchema),
  async (req, res) => {
    try {
      res.status(201).json(await sponsorsService.createMilestone(prisma, req.params.contractId, req.auth!.tenantId, req.body));
    } catch (err) {
      if (err instanceof Error && err.message === "CONTRACT_NOT_FOUND") return res.status(404).json({ error: "Contract not found" });
      throw err;
    }
  },
);

sponsorsRouter.post(
  "/contracts/:contractId/milestones/generate-monthly",
  requireAuth,
  requirePermission("sponsors", "write"),
  validateUuidParam("contractId"),
  validateBody(generateMonthlyMilestonesSchema),
  async (req, res) => {
    try {
      res.status(201).json(await sponsorsService.generateMonthlyMilestones(prisma, req.params.contractId, req.auth!.tenantId, req.body));
    } catch (err) {
      if (err instanceof Error && err.message === "CONTRACT_NOT_FOUND") return res.status(404).json({ error: "Contract not found" });
      throw err;
    }
  },
);

sponsorsRouter.patch(
  "/milestones/:id/received",
  requireAuth,
  requirePermission("sponsors", "edit"),
  validateUuidParam("id"),
  validateBody(markMilestoneReceivedSchema),
  async (req, res) => {
    try {
      res.json(await sponsorsService.markMilestoneReceived(prisma, req.params.id, req.auth!.tenantId, req.body));
    } catch (err) {
      if (err instanceof Error && err.message === "MILESTONE_NOT_FOUND") return res.status(404).json({ error: "Milestone not found" });
      throw err;
    }
  },
);

// ── Invoices ─────────────────────────────────────────────────────────────────

sponsorsRouter.post(
  "/milestones/:id/invoice",
  requireAuth,
  requirePermission("sponsors", "edit"),
  validateUuidParam("id"),
  async (req, res) => {
    try {
      const invoice = await generateInvoice(prisma, req.params.id, req.auth!.tenantId);
      res.status(201).json(invoice);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "MILESTONE_NOT_FOUND") return res.status(404).json({ error: "Milestone not found" });
        if (err.message === "INVOICE_ALREADY_EXISTS") return res.status(409).json({ error: "This milestone already has an invoice" });
      }
      throw err;
    }
  },
);

sponsorsRouter.get(
  "/invoices/:id/download",
  requireAuth,
  requirePermission("sponsors", "read"),
  validateUuidParam("id"),
  async (req, res) => {
    const invoice = await prisma.sponsorInvoice.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json({ downloadUrl: await getSignedPhotoUrl(invoice.pdfS3Key), invoiceNumber: invoice.invoiceNumber, shareToken: invoice.shareToken });
  },
);
