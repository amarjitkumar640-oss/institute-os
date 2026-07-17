import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { LoginInput } from "@institute-os/shared";
import type { StaffRole } from "@prisma/client";
import type { AuthPayload } from "../../middleware/auth";

export async function login({ email, password }: LoginInput) {
  const staff = await prisma.staff.findUnique({
    where: { email },
    include: {
      centerAssignments: {
        include: { center: { select: { id: true, name: true } } },
        where:   { center: { isActive: true } },
      },
    },
  });
  if (!staff || !staff.isActive) return null;

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

  const payload = { staffId: staff.id, role: autoCenterRole, centerId: autoCenterId };
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
  };
}

export function refreshAccessToken(refreshToken: string): string | null {
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthPayload;
    return jwt.sign(
      { staffId: payload.staffId, role: payload.role, centerId: payload.centerId ?? null },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] },
    );
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

    const payload = { staffId, role: assignment.role, centerId };
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

  const payload = { staffId, role: staff.role, centerId: null };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  return { accessToken, center: null };
}
