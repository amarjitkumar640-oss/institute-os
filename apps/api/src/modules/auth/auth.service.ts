import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { LoginInput, normalizePhone } from "@institute-os/shared";
import type { StaffRole } from "@prisma/client";
import type { AuthPayload } from "../../middleware/auth";

export async function login({ tenantId, identifier, password }: LoginInput) {
  const trimmed = identifier.trim();

  // The organization is already known (baked into the app build), so this
  // just needs to find which column the identifier matches within that one
  // tenant — no format auto-detection needed, since a match can only ever
  // occur inside this single tenant.
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
      centerAssignments: {
        include: { center: { select: { id: true, name: true } } },
        where:   { center: { isActive: true } },
      },
    },
  });
  if (!staff || !staff.isActive || !staff.tenant.isActive) return null;

  const valid = await bcrypt.compare(password, staff.passwordHash);
  if (!valid) return null;

  const centers = staff.centerAssignments.map((ca) => ({
    id:   ca.center.id,
    name: ca.center.name,
    role: ca.role,
  }));

  // Auto-select if the staff belongs to exactly one center
  const autoCenterId = centers.length === 1 ? centers[0].id   : null;
  const autoCenterRole: StaffRole = centers.length === 1 ? centers[0].role : staff.role;

  const payload: AuthPayload = {
    staffId:  staff.id,
    role:     autoCenterRole,
    centerId: autoCenterId,
    tenantId: staff.tenantId,
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
    staff: { id: staff.id, fullName: staff.fullName, role: staff.role },
    centers,
    // currentCenter is null when staff has multiple centers (they must call select-center)
    currentCenter: centers.length === 1 ? centers[0] : null,
    branding: {
      primary:   staff.tenant.brandPrimary,
      secondary: staff.tenant.brandSecondary,
      accent:    staff.tenant.brandAccent,
      logoUrl:   staff.tenant.logoUrl,
    },
  };
}

export function refreshAccessToken(refreshToken: string): string | null {
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthPayload;
    const reissued: AuthPayload = {
      staffId:  payload.staffId,
      role:     payload.role,
      centerId: payload.centerId ?? null,
      tenantId: payload.tenantId,
    };
    return jwt.sign(reissued, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    });
  } catch {
    return null;
  }
}

export async function selectCenter(staffId: string, centerId: string | null) {
  // Validate: if a centerId is provided, the staff must be assigned to that center
  if (centerId) {
    const assignment = await prisma.centerStaff.findUnique({
      where: { centerId_staffId: { centerId, staffId } },
      include: { center: { select: { id: true, name: true, isActive: true } } },
    });
    if (!assignment || !assignment.center.isActive) return null;

    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { tenantId: true } });
    if (!staff) return null;

    const payload: AuthPayload = { staffId, role: assignment.role, centerId, tenantId: staff.tenantId };
    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    });
    return { accessToken, center: { id: assignment.center.id, name: assignment.center.name } };
  }

  // centerId = null → "All Centers" mode. Staff must have ≥2 center assignments.
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: { centerAssignments: { include: { center: true } } },
  });
  if (!staff || staff.centerAssignments.length < 2) return null;

  const payload: AuthPayload = { staffId, role: staff.role, centerId: null, tenantId: staff.tenantId };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  return { accessToken, center: null };
}
