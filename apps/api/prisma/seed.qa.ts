import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Same default tenant the main seed.ts backfill uses — keep in sync with
// prisma/migrations/*_add_tenant_multitenancy/migration.sql.
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  const adminEmail = "admin@qa";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";

  let tenant = await prisma.tenant.findUnique({ where: { id: DEFAULT_TENANT_ID } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { id: DEFAULT_TENANT_ID, name: "Default Institute", slug: "default" },
    });
  }

  const existingAdmin = await prisma.staff.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        fullName: "Admin",
        phone: "9999999999",
        email: adminEmail,
        role: "admin",
        passwordHash: await bcrypt.hash(adminPassword, 10),
      },
    });
    console.log(`Seeded admin: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
