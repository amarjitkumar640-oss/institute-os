import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CreateSponsorInput, UpdateSponsorInput,
  CreateSponsorshipContractInput, UpdateSponsorshipContractInput,
  CreateMilestoneInput, MarkMilestoneReceivedInput,
} from "@institute-os/shared";

// ── Sponsors ───────────────────────────────────────────────────────────────

export async function listSponsors(db: PrismaClient, tenantId: string) {
  return db.sponsor.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}

export async function getSponsor(db: PrismaClient, sponsorId: string, tenantId: string) {
  return db.sponsor.findFirst({
    where: { id: sponsorId, tenantId },
    include: { contracts: { include: { batch: true, milestones: { include: { invoice: true } } } } },
  });
}

export async function createSponsor(db: PrismaClient, tenantId: string, input: CreateSponsorInput) {
  return db.sponsor.create({ data: { tenantId, ...input } });
}

export async function updateSponsor(db: PrismaClient, sponsorId: string, tenantId: string, input: UpdateSponsorInput) {
  const existing = await db.sponsor.findFirst({ where: { id: sponsorId, tenantId } });
  if (!existing) throw new Error("SPONSOR_NOT_FOUND");
  return db.sponsor.update({ where: { id: sponsorId }, data: input });
}

// ── Sponsorship contracts ────────────────────────────────────────────────────
// One contract per batch (batchId is unique at the DB level) — a batch under
// an active contract is always fully sponsored, never mixed with self-paying
// students (see students.routes.ts's /admit handler).

export async function getContractForBatch(db: PrismaClient | Prisma.TransactionClient, batchId: string, tenantId?: string) {
  return db.sponsorshipContract.findFirst({
    where: tenantId ? { batchId, tenantId } : { batchId },
    include: { sponsor: true, milestones: { include: { invoice: true }, orderBy: { createdAt: "asc" } } },
  });
}

export async function createContract(db: PrismaClient, tenantId: string, input: CreateSponsorshipContractInput) {
  const batch = await db.batch.findFirst({ where: { id: input.batchId, tenantId } });
  if (!batch) throw new Error("BATCH_NOT_FOUND");
  const sponsor = await db.sponsor.findFirst({ where: { id: input.sponsorId, tenantId } });
  if (!sponsor) throw new Error("SPONSOR_NOT_FOUND");
  const existing = await db.sponsorshipContract.findUnique({ where: { batchId: input.batchId } });
  if (existing) throw new Error("BATCH_ALREADY_SPONSORED");

  return db.sponsorshipContract.create({
    data: {
      tenantId,
      sponsorId: input.sponsorId,
      batchId: input.batchId,
      contractedStudentCount: input.contractedStudentCount,
      totalContractAmount: input.totalContractAmount,
      gstRate: input.gstRate ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      notes: input.notes,
    },
  });
}

export async function updateContract(db: PrismaClient, contractId: string, tenantId: string, input: UpdateSponsorshipContractInput) {
  const existing = await db.sponsorshipContract.findFirst({ where: { id: contractId, tenantId } });
  if (!existing) throw new Error("CONTRACT_NOT_FOUND");
  return db.sponsorshipContract.update({ where: { id: contractId }, data: input });
}

// Called inside the admission transaction (students.routes.ts), same
// read-then-act shape as offers.service.ts's findRedeemableOffer — acceptable
// at this institute's actual concurrency (admissions entered one at a time).
export async function findActiveContractForBatch(tx: Prisma.TransactionClient, batchId: string) {
  return tx.sponsorshipContract.findFirst({ where: { batchId, status: "active" } });
}

// ── Payment milestones ───────────────────────────────────────────────────────

export async function createMilestone(db: PrismaClient, contractId: string, tenantId: string, input: CreateMilestoneInput) {
  const contract = await db.sponsorshipContract.findFirst({ where: { id: contractId, tenantId } });
  if (!contract) throw new Error("CONTRACT_NOT_FOUND");
  return db.sponsorPaymentMilestone.create({
    data: { contractId, label: input.label, amount: input.amount, dueDate: input.dueDate ?? null, notes: input.notes },
  });
}

export async function markMilestoneReceived(db: PrismaClient, milestoneId: string, tenantId: string, input: MarkMilestoneReceivedInput) {
  const milestone = await db.sponsorPaymentMilestone.findFirst({ where: { id: milestoneId, contract: { tenantId } } });
  if (!milestone) throw new Error("MILESTONE_NOT_FOUND");
  return db.sponsorPaymentMilestone.update({
    where: { id: milestoneId },
    data: { status: "received", receivedAmount: input.receivedAmount, receivedAt: input.receivedAt ?? new Date() },
  });
}
