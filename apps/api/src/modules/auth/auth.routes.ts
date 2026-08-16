import { Router } from "express";
import { loginSchema } from "@institute-os/shared";
import type { StaffRole } from "@prisma/client";
import { validateBody } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { login, selectCenter, selectRole, refreshAccessToken } from "./auth.service";

const VALID_ROLES: StaffRole[] = ["admin", "teacher", "frontdesk"];

export const authRouter = Router();

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const result = await login(req.body);
  if (!result) return res.status(401).json({ error: "Invalid credentials" });
  res.json(result);
});

authRouter.post("/refresh", (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });
  const accessToken = refreshAccessToken(refreshToken);
  if (!accessToken) return res.status(401).json({ error: "Invalid or expired refresh token" });
  res.json({ accessToken });
});

// Exchange the current JWT for a new one scoped to a specific center.
// Body: { centerId: string } for single-center, or { centerId: null } for all-centers view.
authRouter.post("/select-center", requireAuth, async (req, res) => {
  const centerId: string | null = req.body.centerId ?? null;
  const result = await selectCenter(req.auth!.staffId, centerId);
  if (!result) return res.status(403).json({ error: "Not assigned to this center" });
  res.json(result);
});

// Exchange the current JWT for a new one scoped to a different role this
// staff member holds at their current center. Body: { role: "admin"|"teacher"|"frontdesk" }.
authRouter.post("/select-role", requireAuth, async (req, res) => {
  const role = req.body.role as StaffRole | undefined;
  if (!role || !VALID_ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
  const result = await selectRole(req.auth!.staffId, req.auth!.centerId ?? null, role);
  if (!result) return res.status(403).json({ error: "You do not hold this role here" });
  res.json(result);
});
