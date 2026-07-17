import type { Request } from "express";

/**
 * Returns a Prisma `where` fragment that scopes a query to the JWT's centerId.
 * centerId=null (all-centers mode) or absent (old tokens) → empty object → no filter.
 */
export function centerFilter(req: Request): { centerId?: string } {
  const cid = req.auth?.centerId;
  return cid ? { centerId: cid } : {};
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
