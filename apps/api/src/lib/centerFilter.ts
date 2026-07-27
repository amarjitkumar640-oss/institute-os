import type { Request } from "express";

/**
 * Returns a Prisma `where` fragment that scopes a query to the JWT's tenantId
 * (always present) and centerId (only when a specific center is selected).
 * centerId=null (all-centers mode) → tenantId-only filter.
 */
export function centerFilter(req: Request): { tenantId: string; centerId?: string } {
  const tenantId = req.auth!.tenantId;
  const cid = req.auth?.centerId;
  return cid ? { tenantId, centerId: cid } : { tenantId };
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
