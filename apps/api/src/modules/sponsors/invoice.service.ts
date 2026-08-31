import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import { uploadPhoto, s3PathPrefix } from "../../lib/s3";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface TaxBreakdown {
  taxableAmount: number;
  gstRate: number | null;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

// null gstRate (or 0) = GST-exempt for this contract's invoices. When set,
// CGST+SGST when the sponsor and institute share a state code, else IGST —
// standard Indian GST intra-state/inter-state split.
function computeTax(taxableAmount: number, gstRate: number | null, sponsorStateCode: string | null, tenantStateCode: string | null): TaxBreakdown {
  if (!gstRate) {
    return { taxableAmount, gstRate: null, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: round2(taxableAmount) };
  }
  const sameState = !!sponsorStateCode && !!tenantStateCode && sponsorStateCode === tenantStateCode;
  let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
  if (sameState) {
    cgstAmount = round2((taxableAmount * gstRate) / 2 / 100);
    sgstAmount = round2((taxableAmount * gstRate) / 2 / 100);
  } else {
    igstAmount = round2((taxableAmount * gstRate) / 100);
  }
  const totalAmount = round2(taxableAmount + cgstAmount + sgstAmount + igstAmount);
  return { taxableAmount, gstRate, cgstAmount, sgstAmount, igstAmount, totalAmount };
}

function renderInvoicePdf(data: {
  tenant: { legalName: string | null; name: string; registeredAddress: string | null; gstin: string | null; bankDetails: string | null };
  sponsor: { name: string; address: string | null; gstin: string | null };
  courseName: string;
  batchName: string;
  milestoneLabel: string;
  invoiceNumber: string;
  issueDate: Date;
  tax: TaxBreakdown;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { tenant, sponsor, courseName, batchName, milestoneLabel, invoiceNumber, issueDate, tax } = data;

    doc.fontSize(18).text(tenant.legalName ?? tenant.name);
    doc.fontSize(9).fillColor("#555");
    if (tenant.registeredAddress) doc.text(tenant.registeredAddress);
    if (tenant.gstin) doc.text(`GSTIN: ${tenant.gstin}`);
    doc.moveDown();

    doc.fillColor("#000").fontSize(14).text("TAX INVOICE", { align: "right" });
    doc.fontSize(9).text(`Invoice No: ${invoiceNumber}`, { align: "right" });
    doc.text(`Date: ${issueDate.toISOString().slice(0, 10)}`, { align: "right" });
    doc.moveDown();

    doc.fontSize(11).text("Bill To:");
    doc.fontSize(10).text(sponsor.name);
    if (sponsor.address) doc.text(sponsor.address);
    if (sponsor.gstin) doc.text(`GSTIN: ${sponsor.gstin}`);
    doc.moveDown();

    doc.fontSize(10).text(`Training services — ${courseName}, Batch: ${batchName}`);
    doc.text(`Milestone: ${milestoneLabel}`);
    doc.moveDown();

    doc.text(`Taxable Amount: Rs. ${tax.taxableAmount.toFixed(2)}`);
    if (!tax.gstRate) {
      doc.text("GST: Exempt");
    } else if (tax.igstAmount > 0) {
      doc.text(`IGST (${tax.gstRate}%): Rs. ${tax.igstAmount.toFixed(2)}`);
    } else {
      doc.text(`CGST (${tax.gstRate / 2}%): Rs. ${tax.cgstAmount.toFixed(2)}`);
      doc.text(`SGST (${tax.gstRate / 2}%): Rs. ${tax.sgstAmount.toFixed(2)}`);
    }
    doc.moveDown();
    doc.fontSize(12).text(`Total: Rs. ${tax.totalAmount.toFixed(2)}`, { align: "right" });

    if (tenant.bankDetails) {
      doc.moveDown(2);
      doc.fontSize(9).fillColor("#555").text("Bank Details:");
      doc.text(tenant.bankDetails);
    }

    doc.end();
  });
}

export async function generateInvoice(db: PrismaClient, milestoneId: string, tenantId: string) {
  const milestone = await db.sponsorPaymentMilestone.findFirst({
    where: { id: milestoneId, contract: { tenantId } },
    include: {
      invoice: true,
      contract: { include: { sponsor: true, batch: { include: { course: true } } } },
    },
  });
  if (!milestone) throw new Error("MILESTONE_NOT_FOUND");
  if (milestone.invoice) throw new Error("INVOICE_ALREADY_EXISTS");

  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const { contract } = milestone;
  const { sponsor, batch } = contract;

  const tax = computeTax(
    Number(milestone.amount),
    contract.gstRate !== null ? Number(contract.gstRate) : null,
    sponsor.stateCode,
    tenant.stateCode,
  );

  const issueDate = new Date();
  const shareToken = randomUUID();

  return db.$transaction(async (tx) => {
    const updatedTenant = await tx.tenant.update({
      where: { id: tenantId },
      data: { nextInvoiceSeq: { increment: 1 } },
    });
    const seq = updatedTenant.nextInvoiceSeq - 1;
    const invoiceNumber = `INV-${issueDate.getFullYear()}-${String(seq).padStart(4, "0")}`;

    const pdfBuffer = await renderInvoicePdf({
      tenant, sponsor,
      courseName: batch.course.name,
      batchName: batch.name,
      milestoneLabel: milestone.label,
      invoiceNumber, issueDate, tax,
    });

    const pdfS3Key = `${s3PathPrefix(tenantId, null)}/sponsor-invoices/${contract.id}/${milestone.id}.pdf`;
    await uploadPhoto(pdfS3Key, pdfBuffer, "application/pdf");

    return tx.sponsorInvoice.create({
      data: {
        tenantId,
        contractId: contract.id,
        milestoneId: milestone.id,
        invoiceNumber,
        issueDate,
        taxableAmount: tax.taxableAmount,
        gstRate: tax.gstRate,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        totalAmount: tax.totalAmount,
        pdfS3Key,
        shareToken,
      },
    });
  });
}
