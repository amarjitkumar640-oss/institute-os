// One-time backfill: seeds PermissionGrant rows for every existing tenant so
// that, on day one, the new permission system reproduces today's effective
// access exactly (per LEGACY_ROLE_ACCESS) — nothing changes for anyone until
// an admin actually edits something in the new PermissionsPage UI.
//
// Idempotent: safe to re-run (upsert with `update: {}` never overwrites a
// row that already exists). Also intended to be called from new-tenant
// provisioning so future tenants aren't born fully locked out — see the
// comment at the bottom.
//
// Run with: npx tsx prisma/scripts/seedPermissionDefaults.ts
import { PrismaClient } from "@prisma/client";
import { seedPermissionDefaultsForTenant } from "../../src/modules/permissions/permissions.service";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Seeding permission defaults for ${tenants.length} tenant(s)...`);
  for (const tenant of tenants) {
    await seedPermissionDefaultsForTenant(prisma, tenant.id);
    console.log(`  ✓ ${tenant.name} (${tenant.id})`);
  }
  console.log("Done.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());

// TODO (Part 8 follow-up): call seedPermissionDefaultsForTenant(prisma, newTenant.id)
// wherever new Tenant rows are actually created (tenant provisioning isn't
// part of this codebase's inventory yet — search for `prisma.tenant.create`
// when that flow exists) so future tenants get these same legacy-equivalent
// defaults on day one instead of starting fully locked out.
