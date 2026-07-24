import { PrismaClient } from "@prisma/client";
import { env } from "../src/lib/env";

const prisma = new PrismaClient();

// One-time migration: existing `Student.photoUrl` rows hold a full plain URL
// (`${S3_ENDPOINT}/${S3_BUCKET}/{key}`) from before photos moved to signed
// URLs. Strip the prefix down to the bare object key, which is what the app
// now expects to find in that column. Idempotent — already-migrated rows
// (bare keys, no longer starting with the URL prefix) are left untouched.
async function main() {
  const prefix = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/`;

  const students = await prisma.student.findMany({
    where: { photoUrl: { startsWith: prefix } },
    select: { id: true, photoUrl: true },
  });

  if (students.length === 0) {
    console.log("No students with a legacy full-URL photoUrl found — nothing to do.");
    return;
  }

  console.log(`Found ${students.length} student(s) with a legacy photoUrl to migrate.`);

  for (const s of students) {
    const key = s.photoUrl!.slice(prefix.length);
    await prisma.student.update({ where: { id: s.id }, data: { photoUrl: key } });
    console.log(`  ${s.id}: ${s.photoUrl} -> ${key}`);
  }

  console.log(`Done. Migrated ${students.length} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
