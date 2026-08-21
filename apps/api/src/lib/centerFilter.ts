import type { Request } from "express";
import { prisma } from "./prisma";

/**
 * The center IDs this request is allowed to see data for: `[centerId]` when
 * a specific center is pinned on the JWT, otherwise this staff's own
 * CenterStaff assignments (empty array if they have none). No role-based
 * fallback — "All Centers" means "all centers I'm assigned to," never "the
 * whole tenant," even for admins.
 */
export async function assignedCenterIds(req: Request): Promise<string[]> {
  const cid = req.auth?.centerId;
  if (cid) return [cid];
  const rows = await prisma.centerStaff.findMany({
    where:  { staffId: req.auth!.staffId },
    select: { centerId: true },
  });
  return rows.map((r) => r.centerId);
}

/**
 * Returns a Prisma `where` fragment that scopes a query to the JWT's tenantId
 * (always present) and the staff's assigned center(s) — see assignedCenterIds.
 */
export async function centerFilter(req: Request): Promise<{ tenantId: string; centerId: { in: string[] } }> {
  return { tenantId: req.auth!.tenantId, centerId: { in: await assignedCenterIds(req) } };
}

/**
 * centerId to use when creating a new record.
 * In single-center mode: the JWT's centerId.
 * In all-centers mode: caller must supply it via `fallback` (from req.body.centerId).
 * Returns null if neither is available (caller should return 400).
 */
export function centerIdForCreate(req: Request, fallback?: string | null): string | null {
  return req.auth?.centerId ?? fallback ?? null;
}

/** tenantId to stamp onto a newly-created record — always present on an authenticated request. */
export function tenantIdForCreate(req: Request): string {
  return req.auth!.tenantId;
}
