import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { LoginInput } from "@institute-os/shared";

export async function login({ email, password }: LoginInput) {
  const staff = await prisma.staff.findUnique({ where: { email } });
  if (!staff || !staff.isActive) return null;

  const valid = await bcrypt.compare(password, staff.passwordHash);
  if (!valid) return null;

  const payload = { staffId: staff.id, role: staff.role };
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
  };
}
