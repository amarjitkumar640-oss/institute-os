import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";
import { StaffRole } from "@prisma/client";

export interface AuthPayload {
  staffId: string;
  // Every role this staff member holds at the current center (or the
  // tenant-level fallback roles in all-centers mode) — never empty for an
  // authenticated staff member. This is the *complete* set, used only to
  // populate the role-switcher's choices; it does NOT by itself grant
  // access to anything — see activeRole below.
  roles: StaffRole[];
  // The ONE role currently "in effect" — every requireRole check, ownership
  // check, and permission grant is scoped to this single role, the same way
  // centerId scopes everything to one center. Always one of the values in
  // `roles`. Changed via POST /auth/select-role (mirrors /auth/select-center),
  // never derived implicitly from `roles`.
  activeRole: StaffRole;
  centerId?: string | null;
  tenantId: string;
  facultyId?: string | null;
  // Compact per-screen action string ("rwed") resolved for activeRole alone
  // at login/select-center/select-role time — see
  // modules/permissions/permissions.service.ts. Optional so existing
  // test-constructed payloads (tokens for routes not yet migrated to
  // requirePermission) don't need updating until their module actually
  // migrates; hasPermission() already treats a missing value as deny, the
  // safe default.
  permissions?: Record<string, string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
