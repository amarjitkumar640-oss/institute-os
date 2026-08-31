import type { Prisma, PrismaClient } from "@prisma/client";

// ── "First N students in this batch" promotional offers ───────────────────────
//
// Precedence with Course.discountAmount (the standing discount from the
// course-discount feature): if this batch has an active offer with
// remaining slots, ITS discount is used instead of the course's standing
// discount for that admission — not stacked. Once the offer is exhausted or
// deactivated, new admissions fall back to the course's standing discount.
// See findRedeemableOffer's call site in students.routes.ts.

export interface OfferInput {
  discountAmount: number;
  maxRedemptions: number;
}

export async function listOffersForBatch(db: PrismaClient, batchId: string, tenantId: string) {
  return db.batchDiscountOffer.findMany({
    where: { batchId, tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createOffer(db: PrismaClient, batchId: string, tenantId: string, input: OfferInput) {
  const batch = await db.batch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) throw new Error("BATCH_NOT_FOUND");

  return db.batchDiscountOffer.create({
    data: { tenantId, batchId, discountAmount: input.discountAmount, maxRedemptions: input.maxRedemptions },
  });
}

export type UpdateOfferInput = Partial<OfferInput> & { isActive?: boolean };

export async function updateOffer(db: PrismaClient, offerId: string, tenantId: string, input: UpdateOfferInput) {
  const existing = await db.batchDiscountOffer.findFirst({ where: { id: offerId, tenantId } });
  if (!existing) throw new Error("OFFER_NOT_FOUND");

  // A shrunk maxRedemptions can't retroactively undo redemptions already
  // given out — block it rather than silently leaving redeemedCount >
  // maxRedemptions (which would make "remaining slots" math go negative).
  if (input.maxRedemptions !== undefined && input.maxRedemptions < existing.redeemedCount) {
    throw new Error("MAX_REDEMPTIONS_BELOW_REDEEMED_COUNT");
  }

  return db.batchDiscountOffer.update({ where: { id: offerId }, data: input });
}

export type DeleteOfferResult = { ok: true } | { ok: false; hasRedemptions: true; redeemedCount: number };

export async function deleteOffer(db: PrismaClient, offerId: string, tenantId: string): Promise<DeleteOfferResult> {
  const existing = await db.batchDiscountOffer.findFirst({ where: { id: offerId, tenantId } });
  if (!existing) throw new Error("OFFER_NOT_FOUND");

  if (existing.redeemedCount > 0) {
    return { ok: false, hasRedemptions: true, redeemedCount: existing.redeemedCount };
  }

  await db.batchDiscountOffer.delete({ where: { id: offerId } });
  return { ok: true };
}

// Called inside the admission transaction (students.routes.ts), before
// generateSchedule. Read-then-act, same race-tolerance as the existing
// batch-capacity check in enrollments.service.ts — acceptable at this
// institute's actual concurrency (admissions are entered one at a time by
// front-desk staff, not a public self-service rush).
export async function findRedeemableOffer(tx: Prisma.TransactionClient, batchId: string) {
  const offers = await tx.batchDiscountOffer.findMany({ where: { batchId, isActive: true } });
  return offers.find((o) => o.redeemedCount < o.maxRedemptions) ?? null;
}

export async function redeemOffer(tx: Prisma.TransactionClient, offerId: string) {
  await tx.batchDiscountOffer.update({
    where: { id: offerId },
    data: { redeemedCount: { increment: 1 } },
  });
}
