import { PrismaClient, StaffRole } from "@prisma/client";
import { SCREEN_REGISTRY } from "./registry";
import { LEGACY_ROLE_ACCESS } from "./legacyDefaults";

export type Action = "read" | "write" | "edit" | "delete";

const LETTER: Record<Action, string> = { read: "r", write: "w", edit: "e", delete: "d" };

// Compact encoding for the JWT: { screenKey: "rwed" } — only screens with at
// least one granted action are included; an absent key means no access.
// ~13 screens at a few characters each is trivial next to the JWT's other
// claims, so no need for a bitmask.
//
// A staff member can hold more than one role at once (e.g. admin + teacher
// at the same center) — permissions are the union of every held role's
// grants for a screen, never the intersection, so holding an extra role can
// only add access, never take it away.
export async function resolvePermissions(
  db: PrismaClient,
  tenantId: string,
  roles: StaffRole[],
): Promise<Record<string, string>> {
  const grants = await db.permissionGrant.findMany({ where: { tenantId, role: { in: roles } } });
  const out: Record<string, Set<string>> = {};
  for (const g of grants) {
    const letters = out[g.screenKey] ?? (out[g.screenKey] = new Set());
    if (g.canRead) letters.add("r");
    if (g.canWrite) letters.add("w");
    if (g.canEdit) letters.add("e");
    if (g.canDelete) letters.add("d");
  }
  const result: Record<string, string> = {};
  for (const [screenKey, letters] of Object.entries(out)) {
    if (letters.size) result[screenKey] = [...letters].join("");
  }
  return result;
}

export function hasPermission(
  permissions: Record<string, string> | undefined,
  screenKey: string,
  action: Action,
): boolean {
  return !!permissions?.[screenKey]?.includes(LETTER[action]);
}

// Most-privileged first — used to pick a sensible default "active role"
// (see AuthPayload.activeRole) whenever a staff member's held-roles set
// changes out from under them (login, switching centers) and there's no
// explicit choice to preserve yet.
const ROLE_PRIORITY: StaffRole[] = ["admin", "teacher", "frontdesk"];

export function pickActiveRole(roles: StaffRole[]): StaffRole {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? roles[0] ?? "frontdesk";
}

const ALL_ROLES: StaffRole[] = ["admin", "teacher", "frontdesk"];

// Seeds legacy-equivalent PermissionGrant rows for one tenant — shared by
// the one-time production backfill script (prisma/scripts/seedPermissionDefaults.ts)
// and test setup (a tenant with zero PermissionGrant rows denies everything,
// per the deliberate "missing row = deny" rule, so every test tenant needs
// this called once after it's created).
export async function seedPermissionDefaultsForTenant(db: PrismaClient, tenantId: string) {
  for (const screen of SCREEN_REGISTRY) {
    for (const role of ALL_ROLES) {
      const letters = LEGACY_ROLE_ACCESS[screen.key]?.[role] ?? "";
      await db.permissionGrant.upsert({
        where: { tenantId_role_screenKey: { tenantId, role, screenKey: screen.key } },
        update: {},
        create: {
          tenantId, role, screenKey: screen.key,
          canRead: letters.includes("r"), canWrite: letters.includes("w"),
          canEdit: letters.includes("e"), canDelete: letters.includes("d"),
        },
      });
    }
  }
}
