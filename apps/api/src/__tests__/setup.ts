import { prisma } from "../lib/prisma";
import type { StaffRole } from "@prisma/client";
import { LEGACY_ROLE_ACCESS } from "../modules/permissions/legacyDefaults";
import { SCREEN_REGISTRY } from "../modules/permissions/registry";

// Mirrors what resolvePermissions() would compute for a freshly-seeded
// tenant, without a DB round-trip. Test files hand-craft JWTs directly
// (bypassing login()/selectCenter(), which are what actually call
// resolvePermissions in production) — this lets their tokenFor() helpers
// include a real permissions claim so already-migrated (requirePermission)
// routes behave the same for a hand-crafted test token as they would for a
// real login.
// Unions across every held role, same as resolvePermissions() does for a
// real multi-role staff member — never the intersection.
export function legacyPermissionsForRole(roles: StaffRole[]): Record<string, string> {
  const out: Record<string, Set<string>> = {};
  for (const screen of SCREEN_REGISTRY) {
    const letters = out[screen.key] ?? (out[screen.key] = new Set());
    for (const role of roles) {
      const forRole = LEGACY_ROLE_ACCESS[screen.key]?.[role];
      if (forRole) for (const ch of forRole) letters.add(ch);
    }
  }
  const result: Record<string, string> = {};
  for (const [screenKey, letters] of Object.entries(out)) {
    if (letters.size) result[screenKey] = [...letters].join("");
  }
  return result;
}

export async function resetDb() {
  await prisma.paymentTransaction.deleteMany();
  await prisma.scheduleInstallment.deleteMany();
  await prisma.studentFeeSchedule.deleteMany();
  await prisma.templateLine.deleteMany();
  await prisma.courseFeeTemplate.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.admissionApplication.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.student.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.course.deleteMany();
  await prisma.faculty.deleteMany();
  await prisma.notificationRoutingRule.deleteMany();
  await prisma.jobRun.deleteMany();
  await prisma.jobConfig.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.subject.deleteMany();
}
