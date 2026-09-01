import { Router, type Request } from "express";
import { z } from "zod";
import { loginSchema } from "@institute-os/shared";
import type { StaffRole } from "@prisma/client";
import { validateBody } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import { env } from "../../lib/env";
import {
  login, selectCenter, selectRole, refreshAccessToken,
  requestPasswordReset, resetPassword, validateResetCode,
} from "./auth.service";

// Derives the web app's own base URL from the request that's asking for a
// password reset, instead of a manually-configured env var — this is exactly
// how WEB_APP_URL's default silently pointing at localhost broke password
// reset in production; nobody had set it for that deploy.
//
// Referer (not Origin) is the primary signal: QA and production share the
// same domain and differ only by a path prefix baked in at build time
// (thesuccess.in/login for prod, thesuccess.in/qa/login for QA — see
// apps/web's BASE_PATH) — Origin never carries a path, so it can't tell
// those apart, but Referer carries the full page URL the reset request was
// submitted from. The forgot-password form only ever lives on the login
// page itself (no separate /reset-password route), so stripping a trailing
// "/login" off the referer's path recovers exactly the right base for
// whichever deployment sent the request.
// Origin is kept as a fallback for the (rarer) case where Referer is
// stripped by the browser's referrer-policy but Origin still comes through;
// env.WEB_APP_URL is the last resort for a non-browser caller with neither.
export function resolveWebAppUrl(req: Request): string {
  const referer = req.headers.referer;
  if (referer) {
    try {
      const u = new URL(referer);
      const base = u.pathname.replace(/\/login\/?$/, "");
      return `${u.origin}${base}`;
    } catch { /* malformed referer — fall through */ }
  }
  if (req.headers.origin) return req.headers.origin;
  return env.WEB_APP_URL;
}

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

const forgotPasswordSchema = z.object({
  tenantId:   z.string().uuid(),
  identifier: z.string().trim().min(1),
});

// "not-found" and "sent" both respond { ok: true } — never gives a caller a
// way to enumerate valid identifiers. "delivery-failed" is surfaced
// distinctly on purpose: it only happens for an account that's already
// confirmed to exist, so it can't be used to probe identity, and silently
// swallowing it strands a real user checking an inbox that was never going
// to receive anything (see auth.service.ts's requestPasswordReset comment).
authRouter.post("/forgot-password", validateBody(forgotPasswordSchema), async (req, res) => {
  const result = await requestPasswordReset(req.body.tenantId, req.body.identifier, resolveWebAppUrl(req));
  if (result === "delivery-failed") {
    // Deliberately doesn't say "try again" — a config problem (unverified
    // sending domain, bad credentials, etc., see the server log for which)
    // fails identically on every retry until an admin fixes it. Telling the
    // end user to retry would be a false promise and just produce confused
    // repeat attempts instead of the one thing that actually helps: getting
    // an admin to look at it.
    return res.status(502).json({ error: "We're unable to send password reset messages right now — this is a system issue on our end, not something you did. Please contact your institute admin for help." });
  }
  res.json({ ok: true });
});

const validateResetCodeSchema = z.object({
  tenantId:   z.string().uuid(),
  identifier: z.string().trim().min(1),
  code:       z.string().min(1),
});

// Lets the emailed-link flow tell "this link is expired/already used" apart
// from the reset form BEFORE the user fills anything in — read-only, doesn't
// consume the token. Same generic-boolean posture as everything else here:
// a bogus identifier and an expired/reused/wrong code are indistinguishable.
authRouter.post("/validate-reset-code", validateBody(validateResetCodeSchema), async (req, res) => {
  const valid = await validateResetCode(req.body.tenantId, req.body.identifier, req.body.code);
  res.json({ valid });
});

const resetPasswordSchema = z.object({
  tenantId:   z.string().uuid(),
  identifier: z.string().trim().min(1),
  code:       z.string().min(1),
  password:   z.string().min(6),
});

authRouter.post("/reset-password", validateBody(resetPasswordSchema), async (req, res) => {
  const ok = await resetPassword(req.body.tenantId, req.body.identifier, req.body.code, req.body.password);
  if (!ok) return res.status(400).json({ error: "Invalid or expired code." });
  res.json({ ok: true });
});
