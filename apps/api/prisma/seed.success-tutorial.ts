import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const TENANT_ID = "00000000-0000-0000-0000-000000000002";

async function main() {
  // ── Tenant ────────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { id: TENANT_ID },
    update: {
      brandPrimary:    "#9B1C1C",
      brandSecondary:  "#B45309",
      brandAccent:     "#F59E0B",
      brandBackground: "#FEF9EE",
    },
    create: {
      id:              TENANT_ID,
      name:            "The Success Tutorial Classes",
      slug:            "success-tutorial",
      brandPrimary:    "#9B1C1C",
      brandSecondary:  "#B45309",
      brandAccent:     "#F59E0B",
      brandBackground: "#FEF9EE",
    },
  });
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // ── Center ────────────────────────────────────────────────────────────────────
  let center = await prisma.center.findFirst({ where: { tenantId: tenant.id, name: "Ghatsila Branch" } });
  if (!center) {
    center = await prisma.center.create({ data: { tenantId: tenant.id, name: "Ghatsila Branch" } });
  }
  console.log(`Center: ${center.name} (${center.id})`);

  // ── Admin staff ───────────────────────────────────────────────────────────────
  const adminEmail    = "admin@success-tutorial.local";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";

  const existing = await prisma.staff.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const staff = await prisma.staff.create({
      data: {
        tenantId:     tenant.id,
        fullName:     "Admin",
        phone:        "9000000002",
        email:        adminEmail,
        role:         "admin",
        passwordHash: await bcrypt.hash(adminPassword, 10),
      },
    });
    await prisma.centerStaff.create({
      data: { centerId: center.id, staffId: staff.id, role: "admin" },
    });
    console.log(`Admin staff: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  console.log(`\nTenant ID:  ${tenant.id}`);
  console.log(`Login with: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
