import { NextFunction, Request, Response } from "express";
import { StaffRole } from "@prisma/client";

export function requireRole(...roles: StaffRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.activeRole)) {
      return res.status(403).json({ error: "Forbidden for this role" });
    }
    next();
  };
}
