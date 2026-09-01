import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createElement } from "react";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { LoginInput, normalizePhone } from "@institute-os/shared";
import type { StaffRole } from "@prisma/client";
import type { AuthPayload } from "../../middleware/auth";
import { resolvePermissions, pickActiveRole } from "../permissions/permissions.service";
import { getSignedPhotoUrl, resolveLogoUrl } from "../../lib/s3";
import { sendEmail } from "../../lib/email";
import { sendSms } from "../../lib/sms";
import { renderEmail } from "../../emails/render";
import PasswordResetEmail from "../../emails/templates/PasswordResetEmail";

export async function login({ tenantId, identifier, password }: LoginInput) {
  const trimmed = identifier.trim();

  const staff = await prisma.staff.findFirst({
    where: {
      tenantId,
      OR: [
        { phone: normalizePhone(trimmed) },
        { email: { equals: trimmed, mode: "insensitive" } },
        { username: trimmed },
      ],
    },
    include: {
      tenant: true,
      linkedFaculty: { select: { id: true } },
    },
  });
  if (!staff || !staff.isActive || !staff.tenant.isActive) return null;

  const valid = await bcrypt.compare(password, staff.passwordHash);
  if (!valid) return null;

  // Source of truth for centers is this staff's own CenterStaff assignments
  // (same pattern as GET /api/centers) — not every center in the tenant.
  const assignments = await prisma.centerStaff.findMany({
    where:   { staffId: staff.id, center: { isActive: true, tenantId } },
    select:  { roles: true, center: { select: { id: true, name: true } } },
    orderBy: { center: { name: "asc" } },
  });
  const centers = assignments.map((a) => ({
    id:    a.center.id,
    name:  a.center.name,
    roles: a.roles,
  }));

  // Auto-select if this staff is assigned to exactly one active center
  const autoCenterId = centers.length === 1 ? centers[0].id    : null;
  const autoCenterRoles: StaffRole[] = centers.length === 1 ? centers[0].roles : staff.roles;
  // No prior session to preserve a choice from — default to the
  // most-privileged role this staff holds here (see pickActiveRole).
  const activeRole = pickActiveRole(autoCenterRoles);

  // Resolved from activeRole alone (what the JWT actually enforces), not the
  // full roles set — a staff member's access is always scoped to whichever
  // single role is currently active, the same way it's scoped to a single
  // center. Switching roles (POST /auth/select-role) re-resolves this.
  const permissions = await resolvePermissions(prisma, staff.tenantId, [activeRole]);

  const payload: AuthPayload = {
    staffId:   staff.id,
    roles:     autoCenterRoles,
    activeRole,
    centerId:  autoCenterId,
    tenantId:  staff.tenantId,
    facultyId: staff.linkedFaculty?.id ?? null,
    permissions,
  };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
  });

  return {
    accessToken,
    refreshToken,
    // roles/activeRole/permissions here mirror the payload above, not the
    // flat staff.roles — so the client's displayed identity always matches
    // what the API will actually allow.
    staff: {
      id: staff.id, fullName: staff.fullName, roles: autoCenterRoles, activeRole, permissions,
      photoUrl: staff.photoUrl ? await getSignedPhotoUrl(staff.photoUrl) : null,
    },
    centers,
    currentCenter: centers.length === 1 ? centers[0] : null,
    branding: {
      primary:    staff.tenant.brandPrimary,
      secondary:  staff.tenant.brandSecondary,
      accent:     staff.tenant.brandAccent,
      background: staff.tenant.brandBackground,
      headerBg:   staff.tenant.brandHeaderBg,
      // A stored logoUrl can be a private-bucket object key (uploaded, not
      // pasted as an external link) — resolveLogoUrl signs it into a usable
      // URL the same way every other tenant-lookup route already does
      // (tenants.routes.ts). Missed here before, so the sidebar/login logo
      // silently failed to load for any tenant with an uploaded (not
      // externally-linked) logo.
      logoUrl:    await resolveLogoUrl(staff.tenant.logoUrl),
    },
  };
}

// Same identifier resolution as login() — kept as its own helper since
// requestPasswordReset/resetPassword both need it and login()'s version
// isn't exported.
async function findStaffByIdentifier(tenantId: string, identifier: string) {
  const trimmed = identifier.trim();
  return prisma.staff.findFirst({
    where: {
      tenantId,
      OR: [
        { phone: normalizePhone(trimmed) },
        { email: { equals: trimmed, mode: "insensitive" } },
        { username: trimmed },
      ],
    },
    include: { tenant: true },
  });
}

function hashResetCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// "not-found" and "sent" must map to the exact same client-visible response
// (see auth.routes.ts) — that's what keeps this from being an enumeration
// oracle. "delivery-failed" is safe to surface distinctly: it only happens
// AFTER we've already confirmed the account exists, so distinguishing it
// leaks a fact about the mail/SMS provider's health, never about identity.
export async function requestPasswordReset(tenantId: string, identifier: string, webAppUrl: string): Promise<"sent" | "not-found" | "delivery-failed"> {
  const staff = await findStaffByIdentifier(tenantId, identifier);
  if (!staff || !staff.isActive || !staff.tenant.isActive) return "not-found";

  // Delivery channel mirrors the tenant's own login method — a phone-login
  // tenant's staff think of their phone as their identity, an
  // email/username-login tenant's staff think of their email as theirs.
  const bySms = staff.tenant.loginMethod === "phone";
  const code = bySms
    ? String(crypto.randomInt(100000, 1000000)) // 6-digit — short enough to type from an SMS
    : crypto.randomBytes(32).toString("hex");     // long random token, embedded in an emailed link
  const expiresAt = new Date(Date.now() + (bySms ? 15 : 60) * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { staffId: staff.id, tokenHash: hashResetCode(code), channel: bySms ? "sms" : "email", expiresAt },
  });

  let delivered: boolean;
  if (bySms) {
    // Staff.phone is stored as bare digits (see normalizePhone) — Twilio
    // needs E.164. This app's phone-login tenants are India-only today
    // (same assumption already baked into en-IN formatting elsewhere in
    // this codebase), so a bare 10-digit number gets a +91 prefix.
    const e164 = staff.phone.length === 10 ? `+91${staff.phone}` : `+${staff.phone}`;
    delivered = await sendSms(e164, `Your Institute OS password reset code is ${code}. It expires in 15 minutes. Do not share this code.`);
  } else {
    // LoginPage reads these three params on mount and jumps straight into
    // the "enter new password" step, pre-filled — there's no separate
    // /reset-password route, this is intentionally the same page.
    const link = `${webAppUrl}/login?resetTenantId=${tenantId}&resetIdentifier=${encodeURIComponent(identifier.trim())}&resetCode=${code}`;
    const html = await renderEmail(createElement(PasswordResetEmail, {
      firstName:    staff.fullName.split(" ")[0],
      resetUrl:     link,
      expiresIn:    "1 hour",
      // Falls back to the template's own default when the tenant hasn't set
      // a brand color — same "null means use the default brand" convention
      // as everywhere else brandPrimary is read (see Tenant model comment).
      primaryColor: staff.tenant.brandPrimary ?? undefined,
    }));
    delivered = await sendEmail(staff.email, "Reset your Institute OS password", html);
  }

  return delivered ? "sent" : "delivery-failed";
}

// Shared by resetPassword() and validateResetCode() — a matching row that's
// unused and unexpired, or null for every failure mode (no such staff,
// wrong/expired/already-used code) without distinguishing which.
async function findValidResetToken(tenantId: string, identifier: string, code: string) {
  const staff = await findStaffByIdentifier(tenantId, identifier);
  if (!staff) return null;
  return prisma.passwordResetToken.findFirst({
    where: { staffId: staff.id, tokenHash: hashResetCode(code), usedAt: null, expiresAt: { gt: new Date() } },
  });
}

// Read-only check — lets the client tell "this link is expired/already used"
// apart from "here's the reset form" BEFORE the user fills anything in,
// without actually consuming the token. Same anti-enumeration posture as
// requestPasswordReset/resetPassword: a bogus identifier and an
// expired/reused/wrong code all just resolve to `false`, indistinguishably.
export async function validateResetCode(tenantId: string, identifier: string, code: string): Promise<boolean> {
  return (await findValidResetToken(tenantId, identifier, code)) !== null;
}

export async function resetPassword(tenantId: string, identifier: string, code: string, newPassword: string): Promise<boolean> {
  const record = await findValidResetToken(tenantId, identifier, code);
  if (!record) return false;

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.staff.update({ where: { id: record.staffId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  return true;
}

export function refreshAccessToken(refreshToken: string): string | null {
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthPayload;
    const reissued: AuthPayload = {
      staffId:    payload.staffId,
      roles:      payload.roles,
      activeRole: payload.activeRole,
      centerId:   payload.centerId ?? null,
      tenantId:   payload.tenantId,
      facultyId:  payload.facultyId ?? null,
      // Carried through unchanged, never re-resolved — same lifecycle as
      // activeRole: a role switch or permission change takes effect at next
      // login/select-center/select-role, not next token refresh.
      permissions: payload.permissions ?? {},
    };
    return jwt.sign(reissued, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    });
  } catch {
    return null;
  }
}

export async function selectCenter(staffId: string, centerId: string | null) {
  const staff = await prisma.staff.findUnique({
    where:   { id: staffId },
    select:  { tenantId: true, roles: true, linkedFaculty: { select: { id: true } } },
  });
  if (!staff) return null;

  if (centerId) {
    // Validate the center belongs to this tenant and is active
    const center = await prisma.center.findFirst({
      where: { id: centerId, tenantId: staff.tenantId, isActive: true },
      select: { id: true, name: true },
    });
    if (!center) return null;

    // Must actually be assigned to this center — not just "exists in the tenant".
    const assignment = await prisma.centerStaff.findUnique({
      where:  { centerId_staffId: { centerId, staffId } },
      select: { roles: true },
    });
    if (!assignment) return null;
    const roles: StaffRole[] = assignment.roles;
    // Switching centers resets the active role to this center's
    // most-privileged held role — a role active at the previous center may
    // not even exist at the new one, so there's nothing sensible to preserve.
    const activeRole = pickActiveRole(roles);
    const permissions = await resolvePermissions(prisma, staff.tenantId, [activeRole]);

    const payload: AuthPayload = {
      staffId, roles, activeRole, centerId, tenantId: staff.tenantId,
      facultyId: staff.linkedFaculty?.id ?? null,
      permissions,
    };
    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    });
    // The refresh token must be reissued too, not just the access token —
    // otherwise it stays pinned to whatever activeRole/centerId was in effect
    // at login. The next silent access-token refresh (every JWT_ACCESS_TTL,
    // driven by the client's 401 interceptor) would then re-sign THAT stale
    // payload, silently reverting the effective server-side center/role back
    // to its login-time value while the client UI still shows the switched-to
    // one — exactly the bug this fixes.
    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
    });
    // roles/activeRole/permissions returned so the client can update its
    // local StaffInfo after switching centers — without this, the client's
    // displayed role/permissions would go stale after a center switch until
    // the next full login.
    return { accessToken, refreshToken, center, roles, activeRole, permissions };
  }

  // centerId = null → "All Centers" mode. This staff must themselves be
  // assigned to ≥2 active centers — not just "the tenant has ≥2 centers".
  const assignedCount = await prisma.centerStaff.count({
    where: { staffId, center: { tenantId: staff.tenantId, isActive: true } },
  });
  if (assignedCount < 2) return null;

  const roles = staff.roles as StaffRole[];
  const activeRole = pickActiveRole(roles);
  const permissions = await resolvePermissions(prisma, staff.tenantId, [activeRole]);

  const payload: AuthPayload = {
    staffId, roles, activeRole, centerId: null, tenantId: staff.tenantId,
    facultyId: staff.linkedFaculty?.id ?? null,
    permissions,
  };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
  });
  return { accessToken, refreshToken, center: null, roles, activeRole, permissions };
}

// Exchange the current JWT for a new one scoped to a different role this
// staff member holds at their CURRENT center (or, in all-centers mode, a
// role present in their tenant-level fallback roles) — mirrors selectCenter
// exactly, but along the role axis instead of the center axis. Never lets a
// staff member activate a role they don't actually hold, regardless of what
// the client sends.
export async function selectRole(staffId: string, centerId: string | null, role: StaffRole) {
  const staff = await prisma.staff.findUnique({
    where:  { id: staffId },
    select: { tenantId: true, roles: true, linkedFaculty: { select: { id: true } } },
  });
  if (!staff) return null;

  let heldRoles: StaffRole[];
  let center: { id: string; name: string } | null = null;

  if (centerId) {
    const assignment = await prisma.centerStaff.findUnique({
      where:  { centerId_staffId: { centerId, staffId } },
      select: { roles: true, center: { select: { id: true, name: true, isActive: true, tenantId: true } } },
    });
    if (!assignment || !assignment.center.isActive || assignment.center.tenantId !== staff.tenantId) return null;
    heldRoles = assignment.roles;
    center = { id: assignment.center.id, name: assignment.center.name };
  } else {
    heldRoles = staff.roles;
  }

  if (!heldRoles.includes(role)) return null; // not actually held — refuse, don't silently fall back

  const permissions = await resolvePermissions(prisma, staff.tenantId, [role]);

  const payload: AuthPayload = {
    staffId, roles: heldRoles, activeRole: role, centerId, tenantId: staff.tenantId,
    facultyId: staff.linkedFaculty?.id ?? null,
    permissions,
  };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  // Reissued for the same reason as selectCenter()'s refresh token above —
  // without this, the refresh token stays pinned to the activeRole held at
  // login, and the next silent access-token refresh silently reverts the
  // switched-to role back to it.
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions["expiresIn"],
  });
  return { accessToken, refreshToken, center, roles: heldRoles, activeRole: role, permissions };
}
