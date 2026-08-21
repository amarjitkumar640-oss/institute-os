// One-off script: normalize Staff.phone numbers and check for collisions
// before adding a global @unique constraint on the column. Run manually:
//
//   npx tsx apps/api/scripts/normalize-phones.ts
//
// If any collisions are found, the script aborts WITHOUT writing anything —
// duplicate real staff records must be resolved by hand (a business decision,
// not something this script should silently paper over).

import { prisma } from "../src/lib/prisma";
import { normalizePhone } from "@institute-os/shared";

async function main() {
  const all = await prisma.staff.findMany({ select: { id: true, phone: true, tenantId: true } });

  const byNormalized = new Map<string, typeof all>();
  for (const s of all) {
    const norm = normalizePhone(s.phone);
    byNormalized.set(norm, [...(byNormalized.get(norm) ?? []), s]);
  }

  const conflicts = [...byNormalized.entries()].filter(([, rows]) => rows.length > 1);
  if (conflicts.length > 0) {
    console.error(`Found ${conflicts.length} phone-number collision(s) after normalization:`);
    for (const [norm, rows] of conflicts) {
      console.error(
        `  "${norm}" <- ${rows.map((r) => `${r.id} (tenant ${r.tenantId}, raw "${r.phone}")`).join(", ")}`
      );
    }
    console.error("\nResolve these manually (edit the affected Staff rows) before running the migration. Aborting — no writes made.");
    process.exitCode = 1;
    return;
  }

  let changed = 0;
  for (const s of all) {
    const norm = normalizePhone(s.phone);
    if (norm !== s.phone) {
      await prisma.staff.update({ where: { id: s.id }, data: { phone: norm } });
      changed++;
    }
  }
  console.log(`Normalized ${all.length} staff phone numbers, 0 conflicts, ${changed} row(s) updated.`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
