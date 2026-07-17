import { Router } from "express";
import { loginSchema } from "@institute-os/shared";
import { validateBody } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { login, selectCenter, refreshAccessToken } from "./auth.service";

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
