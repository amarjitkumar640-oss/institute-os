import { NextFunction, Request, Response } from "express";
import { Action, hasPermission } from "../modules/permissions/permissions.service";

// Reads the JWT-embedded permission claim resolved at login/select-center
// time (see auth.service.ts) — no DB lookup on the request path. Same
// response shape as requireRole so swapping call sites needs no test churn
// beyond the middleware name itself.
export function requirePermission(screenKey: string, action: Action) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !hasPermission(req.auth.permissions, screenKey, action)) {
      return res.status(403).json({ error: "Forbidden for this role" });
    }
    next();
  };
}
