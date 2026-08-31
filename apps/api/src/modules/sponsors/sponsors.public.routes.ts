import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { getSignedPhotoUrl } from "../../lib/s3";

export const sponsorsPublicRouter = Router();

// ── GET /api/public/sponsor-invoices/:shareToken — unauthenticated ────────────
// Lets a sponsor company open/download their invoice without logging in.
// shareToken is a random, unguessable lookup key (not the invoice's own id),
// mirroring app-releases.routes.ts's GET /slug/:slug/latest pattern of
// minting a fresh presigned URL per request rather than ever storing one —
// the bucket is private, so a stale stored URL would eventually 403 anyway.
sponsorsPublicRouter.get("/sponsor-invoices/:shareToken", async (req, res) => {
  const invoice = await prisma.sponsorInvoice.findUnique({
    where: { shareToken: req.params.shareToken },
    include: { contract: { include: { sponsor: true } } },
  });
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });

  res.json({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    sponsorName: invoice.contract.sponsor.name,
    totalAmount: invoice.totalAmount,
    downloadUrl: await getSignedPhotoUrl(invoice.pdfS3Key),
  });
});
