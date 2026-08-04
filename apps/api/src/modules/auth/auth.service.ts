import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { LoginInput, normalizePhone } from "@institute-os/shared";
import type { StaffRole } from "@prisma/client";
import type { AuthPayload } from "../../middleware/auth";

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
    select:  { role: true, center: { select: { id: true, name: true } } },
    orderBy: { center: { name: "asc" } },
  });
  const centers = assignments.map((a) => ({
    id:   a.center.id,
    name: a.center.name,
    role: a.role,
  }));

  // Auto-select if this staff is assigned to exactly one active center
  const autoCenterId = centers.length === 1 ? centers[0].id   : null;
  const autoCenterRole: StaffRole = centers.length === 1 ? centers[0].role : staff.role;

  const payload: AuthPayload = {
    staffId:   staff.id,
    role:      autoCenterRole,
    centerId:  autoCenterId,
    tenantId:  staff.tenantId,
    facultyId: staff.linkedFaculty?.id ?? null,
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
    currentCenter: centers.length === 1 ? centers[0] : null,
    branding: {
      primary:    staff.tenant.brandPrimary,
      secondary:  staff.tenant.brandSecondary,
      accent:     staff.tenant.brandAccent,
      background: staff.tenant.brandBackground,
      headerBg:   staff.tenant.brandHeaderBg,
      logoUrl:    staff.tenant.logoUrl,
    },
  };
}

export function refreshAccessToken(refreshToken: string): string | null {
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthPayload;
    const reissued: AuthPayload = {
      staffId:   payload.staffId,
      role:      payload.role,
      centerId:  payload.centerId ?? null,
      tenantId:  payload.tenantId,
      facultyId: payload.facultyId ?? null,
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
    select:  { tenantId: true, role: true, linkedFaculty: { select: { id: true } } },
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
      select: { role: true },
    });
    if (!assignment) return null;
    const role: StaffRole = assignment.role;

    const payload: AuthPayload = {
      staffId, role, centerId, tenantId: staff.tenantId,
      facultyId: staff.linkedFaculty?.id ?? null,
    };
    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
    });
    return { accessToken, center };
  }

  // centerId = null → "All Centers" mode. This staff must themselves be
  // assigned to ≥2 active centers — not just "the tenant has ≥2 centers".
  const assignedCount = await prisma.centerStaff.count({
    where: { staffId, center: { tenantId: staff.tenantId, isActive: true } },
  });
  if (assignedCount < 2) return null;

  const payload: AuthPayload = {
    staffId, role: staff.role as StaffRole, centerId: null, tenantId: staff.tenantId,
    facultyId: staff.linkedFaculty?.id ?? null,
  };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  return { accessToken, center: null };
}
