import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@qa";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";

  const existingAdmin = await prisma.staff.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.staff.create({
      data: {
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
