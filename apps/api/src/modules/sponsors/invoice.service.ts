import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";
import PDFDocument from "pdfkit";
import { uploadPhoto, getPhotoBuffer, s3PathPrefix } from "../../lib/s3";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Blends a hex color toward white — used for the tenant-brand-tinted info
// boxes and table zebra-striping, so those stay legible regardless of how
// light or dark the tenant's own brand color is.
function tint(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// GSTIN's characters 3–12 (1-indexed) are the holder's PAN — no separate PAN
// field on Tenant, so it's derived rather than asked for twice.
function panFromGstin(gstin: string | null): string | null {
  if (!gstin || gstin.length < 12) return null;
  return gstin.slice(2, 12).toUpperCase();
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

interface TdsBreakdown {
  tdsRate: number | null;
  tdsAmount: number;
}

// null tdsRate (or 0) = no TDS deducted. TDS is computed on the taxable
// (pre-GST) value only — GST itself is never subject to TDS under Indian
// tax rules — and deducted from the GST-inclusive total to get what the
// institute will actually receive.
function computeTds(taxableAmount: number, tdsRate: number | null): TdsBreakdown {
  if (!tdsRate) return { tdsRate: null, tdsAmount: 0 };
  return { tdsRate, tdsAmount: round2((taxableAmount * tdsRate) / 100) };
}

interface AttendanceRow {
  studentName: string;
  studentCode: string | null;
  // One mark per session date, in the same order as AttendanceGrid.sessionDates
  // — "P"/"A"/null (null = no mark recorded for that session at all).
  marks: ("P" | "A" | null)[];
  present: number;
  totalSessions: number;
}

interface AttendanceGrid {
  sessionDates: Date[];
  rows: AttendanceRow[];
}

// Attendance is documentation only — it never changes the billed amount
// (see SponsorPaymentMilestone.periodStart's schema comment). Pulled fresh
// from SessionAttendance at invoice-generation time, not stored on the
// invoice row, so it always reflects marks made up to that moment. A
// day-by-day P/A grid (like a physical attendance register) rather than
// just a present/total summary, per what was actually wanted on the invoice.
async function fetchAttendanceGrid(
  db: PrismaClient, batchId: string, periodStart: Date, periodEnd: Date,
): Promise<AttendanceGrid> {
  const sessions = await db.classSession.findMany({
    // Excludes cancelled sessions (holidays, faculty leave, etc. — see
    // SessionDetailScreen's "Cancel Class" flow) — no class happened that
    // day, so it shouldn't appear as a column at all, and shouldn't count
    // toward the totalSessions denominator either.
    where: { batchId, scheduledDate: { gte: periodStart, lte: periodEnd }, status: { not: "cancelled" } },
    select: { id: true, scheduledDate: true },
    orderBy: { scheduledDate: "asc" },
  });
  const sessionDates = sessions.map((s) => s.scheduledDate);
  const sessionIndexById = new Map(sessions.map((s, i) => [s.id, i]));

  const enrollments = await db.enrollment.findMany({
    where: { batchId, status: "active" },
    select: { student: { select: { id: true, fullName: true, studentCode: true } } },
  });

  const marksByStudent = new Map<string, ("P" | "A" | null)[]>();
  for (const e of enrollments) marksByStudent.set(e.student.id, new Array(sessions.length).fill(null));

  if (sessions.length > 0) {
    const attendance = await db.sessionAttendance.findMany({
      where: { classSessionId: { in: sessions.map((s) => s.id) } },
      select: { studentId: true, classSessionId: true, status: true },
    });
    for (const a of attendance) {
      const row = marksByStudent.get(a.studentId);
      const idx = sessionIndexById.get(a.classSessionId);
      if (row && idx !== undefined) row[idx] = a.status === "present" ? "P" : "A";
    }
  }

  const rows = enrollments
    .map((e) => {
      const marks = marksByStudent.get(e.student.id) ?? [];
      return {
        studentName: e.student.fullName,
        studentCode: e.student.studentCode,
        marks,
        present: marks.filter((m) => m === "P").length,
        totalSessions: sessions.length,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  return { sessionDates, rows };
}

// `logoUrl` is either a plain external URL or a private-bucket object key —
// same duality as resolveLogoUrl, but this needs the actual bytes to embed
// in the PDF, not a browser-facing link. A logo failure should never block
// invoice generation, so callers get null instead of a thrown error.
async function fetchLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    return await getPhotoBuffer(logoUrl);
  } catch {
    return null;
  }
}

const PAGE_LEFT = 50;
const PAGE_RIGHT = 545; // A4 width (595) - 50 margin
const PAGE_WIDTH = PAGE_RIGHT - PAGE_LEFT;
const LOW_ATTENDANCE_THRESHOLD = 50; // % — flagged in red + listed in the closing note
const RED = "#b91c1c";
const INK = "#1a1a1a";
const MUTED = "#6b7280";

function renderInvoicePdf(data: {
  tenant: {
    legalName: string | null; name: string; registeredAddress: string | null; gstin: string | null; bankDetails: string | null;
    brandPrimary: string | null; brandAccent: string | null;
  };
  logoBuffer: Buffer | null;
  sponsor: { name: string; address: string | null; gstin: string | null };
  courseName: string;
  batchName: string;
  milestoneLabel: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  tax: TaxBreakdown;
  tds: TdsBreakdown;
  netReceivableAmount: number;
  attendanceGrid: AttendanceGrid | null;
  attendancePeriodLabel: string | null;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const {
      tenant, logoBuffer, sponsor, courseName, batchName, milestoneLabel, invoiceNumber, issueDate, dueDate,
      tax, tds, netReceivableAmount, attendanceGrid, attendancePeriodLabel,
    } = data;
    const accent = tenant.brandPrimary ?? tenant.brandAccent ?? "#B45309";
    const accentLight = tint(accent, 0.9);
    const accentLighter = tint(accent, 0.95);
    const institute = tenant.legalName ?? tenant.name;
    const pan = panFromGstin(tenant.gstin);

    // ── Header: logo (if any) + tenant identity, "TAX INVOICE" on the right ──
    const headerTop = doc.y;
    const nameX = logoBuffer ? PAGE_LEFT + 58 : PAGE_LEFT;
    if (logoBuffer) {
      try { doc.image(logoBuffer, PAGE_LEFT, headerTop, { width: 48, height: 48, fit: [48, 48] }); } catch { /* corrupt/unsupported image — skip it */ }
    }
    doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(institute, nameX, headerTop, { width: PAGE_WIDTH - 200 });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    if (tenant.registeredAddress) doc.text(tenant.registeredAddress, nameX, doc.y, { width: PAGE_WIDTH - 200 });
    if (tenant.gstin) doc.text(`GSTIN: ${tenant.gstin}`, nameX, doc.y, { width: PAGE_WIDTH - 200 });

    doc.font("Helvetica-Bold").fontSize(15).fillColor(accent).text("TAX INVOICE", PAGE_LEFT, headerTop, { width: PAGE_WIDTH, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(`Invoice No: ${invoiceNumber}`, PAGE_LEFT, headerTop + 20, { width: PAGE_WIDTH, align: "right" });
    doc.text(`Invoice Date: ${issueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`, { width: PAGE_WIDTH, align: "right" });
    doc.text(`Due Date: ${dueDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}`, { width: PAGE_WIDTH, align: "right" });

    doc.y = Math.max(doc.y, headerTop + 62);
    doc.moveDown(0.8);

    // ── Accent divider ──
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(2).strokeColor(accent).stroke();
    doc.moveDown(1);

    // ── BILL TO / PROGRAM info boxes ──
    const boxTop = doc.y;
    const boxHeight = 58;
    const boxWidth = (PAGE_WIDTH - 12) / 2;
    doc.rect(PAGE_LEFT, boxTop, boxWidth, boxHeight).fill(accentLighter);
    doc.rect(PAGE_LEFT + boxWidth + 12, boxTop, boxWidth, boxHeight).fill(accentLighter);

    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("BILL TO", PAGE_LEFT + 14, boxTop + 10);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(sponsor.name, PAGE_LEFT + 14, doc.y + 2, { width: boxWidth - 28 });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(sponsor.gstin ? `GSTIN: ${sponsor.gstin}` : "Sponsor", PAGE_LEFT + 14, doc.y + 1, { width: boxWidth - 28 });

    const programX = PAGE_LEFT + boxWidth + 12;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("PROGRAM", programX + 14, boxTop + 10);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text(courseName, programX + 14, boxTop + 22, { width: boxWidth - 28 });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Batch: ${batchName} · ${milestoneLabel}`, programX + 14, doc.y + 1, { width: boxWidth - 28 });

    doc.y = boxTop + boxHeight;
    doc.x = PAGE_LEFT;
    doc.moveDown(1.2);

    // ── Line-item table ──
    const tableTop = doc.y;
    doc.rect(PAGE_LEFT, tableTop, PAGE_WIDTH, 24).fill(INK);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff");
    doc.text("DESCRIPTION", PAGE_LEFT + 12, tableTop + 8);
    doc.text("TAXABLE AMOUNT", PAGE_LEFT, tableTop + 8, { width: PAGE_WIDTH - 12, align: "right" });
    doc.y = tableTop + 24;
    doc.x = PAGE_LEFT;
    doc.moveDown(0.7);

    const descTop = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(INK)
      .text(`Training services rendered under ${courseName} — Batch: ${batchName}.`, PAGE_LEFT + 12, descTop, { width: PAGE_WIDTH - 180 });
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED)
      .text(attendancePeriodLabel ? `Billing period: ${attendancePeriodLabel} · ${milestoneLabel}` : milestoneLabel, PAGE_LEFT + 12, doc.y + 2, { width: PAGE_WIDTH - 180 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(money(tax.taxableAmount), PAGE_LEFT, descTop, { width: PAGE_WIDTH - 12, align: "right" });
    doc.y = Math.max(doc.y, descTop + 30);
    doc.x = PAGE_LEFT;
    doc.moveDown(0.8);

    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.6);

    // Every label/amount pair below shares the description row's own
    // indentation (label at PAGE_LEFT+12, amount right-aligned to
    // PAGE_RIGHT-12) so the whole block reads as one consistent column,
    // instead of each row picking its own left edge.
    const AMOUNT_X = PAGE_LEFT, AMOUNT_WIDTH = PAGE_WIDTH - 12;

    if (!tax.gstRate) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("GST: Exempt", PAGE_LEFT + 12, doc.y);
    } else if (tax.igstAmount > 0) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`IGST (${tax.gstRate}%): ${money(tax.igstAmount)}`, AMOUNT_X, doc.y, { width: AMOUNT_WIDTH, align: "right" });
    } else {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`CGST (${tax.gstRate / 2}%): ${money(tax.cgstAmount)}`, AMOUNT_X, doc.y, { width: AMOUNT_WIDTH, align: "right" });
      doc.text(`SGST (${tax.gstRate / 2}%): ${money(tax.sgstAmount)}`, AMOUNT_X, doc.y, { width: AMOUNT_WIDTH, align: "right" });
    }
    doc.moveDown(1.3);

    let rowY = doc.y;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK);
    doc.text("Total", PAGE_LEFT + 12, rowY);
    doc.text(money(tax.totalAmount), AMOUNT_X, rowY, { width: AMOUNT_WIDTH, align: "right" });
    doc.y = rowY + doc.currentLineHeight();
    doc.x = PAGE_LEFT;

    if (tds.tdsRate) {
      doc.moveDown(0.4);
      rowY = doc.y;
      doc.font("Helvetica").fontSize(9.5).fillColor(RED);
      doc.text(`Less: TDS (${tds.tdsRate}%)`, PAGE_LEFT + 12, rowY);
      doc.text(`- ${money(tds.tdsAmount)}`, AMOUNT_X, rowY, { width: AMOUNT_WIDTH, align: "right" });
      doc.y = rowY + doc.currentLineHeight();
      doc.x = PAGE_LEFT;

      doc.moveDown(0.5);
      const netTop = doc.y;
      doc.rect(PAGE_LEFT, netTop - 4, PAGE_WIDTH, 26).fill(accentLight);
      doc.font("Helvetica-Bold").fontSize(13).fillColor(accent);
      doc.text("Net Receivable", PAGE_LEFT + 12, netTop + 2);
      doc.text(money(netReceivableAmount), AMOUNT_X, netTop + 2, { width: AMOUNT_WIDTH, align: "right" });
      doc.x = PAGE_LEFT;
      doc.y = netTop + 22;
    }
    doc.moveDown(1.4);

    // ── Payment details ──
    if (tenant.bankDetails || pan) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("PAYMENT DETAILS", PAGE_LEFT);
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(9.5).fillColor(INK);
      if (tenant.bankDetails) doc.text(tenant.bankDetails, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
      if (pan) doc.text(`PAN: ${pan}`, PAGE_LEFT, doc.y);
      doc.moveDown(1);
    }

    // ── Attendance register — a day-by-day P/A grid (one box per class
    // session that month), not just a present/total summary. Flows right
    // after Payment Details, auto-paginating via the manual overflow check
    // below if the roster or session count is long. ──
    let flagged: string[] = [];
    if (attendanceGrid && attendanceGrid.rows.length > 0) {
      const { sessionDates, rows } = attendanceGrid;
      doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
      doc.moveDown(0.8);

      doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Student Attendance", PAGE_LEFT, doc.y);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED)
        .text(`Period: ${attendancePeriodLabel ?? ""} · Batch: ${batchName} · ${rows.length} students · ${sessionDates.length} sessions`, PAGE_LEFT, doc.y + 2);
      doc.moveDown(0.8);

      const numW = 20, nameW = 130, totalW = 46;
      const dayAreaW = PAGE_WIDTH - numW - nameW - totalW;
      const dayW = sessionDates.length > 0 ? Math.max(11, Math.min(26, dayAreaW / sessionDates.length)) : 0;
      const dayFontSize = dayW < 16 ? 6.5 : 8;
      const numX = PAGE_LEFT, nameX = numX + numW, dayStartX = nameX + nameW, totalX = dayStartX + dayW * sessionDates.length + 4;
      const rowHeight = 20;

      function drawHeaderRow(y: number) {
        doc.rect(PAGE_LEFT, y, PAGE_WIDTH, rowHeight).fill(INK);
        doc.font("Helvetica-Bold").fontSize(8).fillColor("#fff");
        doc.text("#", numX + 4, y + 6);
        doc.text("Student", nameX, y + 6);
        sessionDates.forEach((d, i) => {
          doc.fontSize(dayFontSize).text(String(d.getUTCDate()).padStart(2, "0"), dayStartX + i * dayW, y + 6, { width: dayW, align: "center" });
        });
        doc.fontSize(8).text("Total", totalX, y + 6, { width: totalW - 4, align: "right" });
      }

      let y = doc.y;
      if (y + rowHeight > 780) { doc.addPage(); y = 50; }
      drawHeaderRow(y);
      y += rowHeight;

      rows.forEach((row, i) => {
        if (y + rowHeight > 780) {
          doc.addPage();
          y = 50;
          drawHeaderRow(y);
          y += rowHeight;
        }
        const pct = row.totalSessions > 0 ? Math.round((row.present / row.totalSessions) * 100) : 0;
        const low = pct < LOW_ATTENDANCE_THRESHOLD;
        if (low) flagged.push(row.studentName);

        if (i % 2 === 1) doc.rect(PAGE_LEFT, y, PAGE_WIDTH, rowHeight).fill(accentLighter);

        doc.font("Helvetica").fontSize(8.5).fillColor(INK);
        doc.text(String(i + 1), numX + 4, y + 6);
        doc.text(row.studentName, nameX, y + 6, { width: nameW - 6 });

        row.marks.forEach((mark, di) => {
          const label = mark === "P" ? "P" : mark === "A" ? "A" : "–";
          doc.font(mark === "A" ? "Helvetica-Bold" : "Helvetica").fontSize(dayFontSize)
            .fillColor(mark === "A" ? RED : mark === "P" ? INK : "#c0c0c0")
            .text(label, dayStartX + di * dayW, y + 6, { width: dayW, align: "center" });
        });

        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(low ? RED : INK)
          .text(`${row.present}/${row.totalSessions}`, totalX, y + 6, { width: totalW - 4, align: "right" });
        y += rowHeight;
      });
      doc.x = PAGE_LEFT;
      doc.y = y;

      if (flagged.length > 0) {
        doc.moveDown(0.8);
        const names = flagged.length <= 3 ? flagged.join(", ") : `${flagged.slice(0, 3).join(", ")} and ${flagged.length - 3} more`;
        doc.font("Helvetica-Oblique").fontSize(9).fillColor(RED)
          .text(`Note: ${names} ${flagged.length === 1 ? "shows" : "show"} below ${LOW_ATTENDANCE_THRESHOLD}% attendance for this period and may require follow-up before next month's billing.`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
      }
      doc.moveDown(1);
    }

    // ── Closing note — always the last thing on the invoice ──
    if (doc.y > 740) { doc.addPage(); doc.y = 50; }
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
    doc.moveDown(0.8);

    const payAmount = tds.tdsRate ? netReceivableAmount : tax.totalAmount;
    const closingNote = [
      `Kindly process the ${milestoneLabel} sponsorship payment of ${money(payAmount)}${tds.tdsRate ? " (net of TDS)" : ""} at your earliest convenience.`,
      tds.tdsRate ? " Please share the TDS certificate for the deducted amount for our records." : "",
      " For any queries regarding this invoice, please reach out using the contact details above.",
    ].join("");
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(closingNote, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });
    doc.moveDown(0.6);
    doc.text(`Thank you for your continued support of ${institute}'s ${courseName} program.`, PAGE_LEFT, doc.y, { width: PAGE_WIDTH });

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
  const tds = computeTds(tax.taxableAmount, contract.tdsRate !== null ? Number(contract.tdsRate) : null);
  const netReceivableAmount = round2(tax.totalAmount - tds.tdsAmount);

  const logoBuffer = await fetchLogoBuffer(tenant.logoUrl);

  let attendanceGrid: AttendanceGrid | null = null;
  let attendancePeriodLabel: string | null = null;
  if (milestone.periodStart && milestone.periodEnd) {
    attendanceGrid = await fetchAttendanceGrid(db, batch.id, milestone.periodStart, milestone.periodEnd);
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    attendancePeriodLabel = `${fmt(milestone.periodStart)} – ${fmt(milestone.periodEnd)}`;
  }

  const issueDate = new Date();
  const dueDate = milestone.dueDate ?? new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const shareToken = randomUUID();

  return db.$transaction(async (tx) => {
    const updatedTenant = await tx.tenant.update({
      where: { id: tenantId },
      data: { nextInvoiceSeq: { increment: 1 } },
    });
    const seq = updatedTenant.nextInvoiceSeq - 1;
    const invoiceNumber = `INV-${issueDate.getFullYear()}-${String(seq).padStart(4, "0")}`;

    const pdfBuffer = await renderInvoicePdf({
      tenant, logoBuffer, sponsor,
      courseName: batch.course.name,
      batchName: batch.name,
      milestoneLabel: milestone.label,
      invoiceNumber, issueDate, dueDate, tax, tds, netReceivableAmount,
      attendanceGrid, attendancePeriodLabel,
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
        tdsRate: tds.tdsRate,
        tdsAmount: tds.tdsAmount,
        netReceivableAmount,
        pdfS3Key,
        shareToken,
      },
    });
  });
}
