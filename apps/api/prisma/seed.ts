import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const subjects = ["Quant", "Reasoning", "English", "GA/GS"];
  for (const name of subjects) {
    const existing = await prisma.subject.findFirst({ where: { name } });
    if (!existing) await prisma.subject.create({ data: { name } });
  }

  const adminEmail = "admin@institute-os.local";
  const existingAdmin = await prisma.staff.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.staff.create({
      data: {
        fullName: "Admin",
        phone: "9999999999",
        email: adminEmail,
        role: "admin",
        passwordHash: await bcrypt.hash("admin123", 10),
      },
    });
    console.log(`Seeded admin: ${adminEmail} / admin123`);
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
