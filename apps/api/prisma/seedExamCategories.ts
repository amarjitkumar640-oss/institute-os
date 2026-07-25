import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Developer-managed master list of exam categories (SSC, Banking, Railway,
// Foundation, ...). Idempotent (upserts on the unique `key`) — safe to run on
// every deploy, and safe to extend later by adding another upsert call here
// for a new category (no migration needed).
const EXAM_CATEGORIES = [
  { key: "ssc",        label: "SSC",        color: "#8B1E3F", sortOrder: 1 },
  { key: "banking",    label: "Banking",    color: "#2563A8", sortOrder: 2 },
  { key: "railway",    label: "Railway",    color: "#2CA6A4", sortOrder: 3 },
  { key: "foundation", label: "Foundation", color: "#5B2D8E", sortOrder: 4 },
];

async function main() {
  for (const ec of EXAM_CATEGORIES) {
    await prisma.examCategory.upsert({
      where:  { key: ec.key },
      update: { label: ec.label, color: ec.color, sortOrder: ec.sortOrder },
      create: ec,
    });
    console.log(`Ensured exam category: ${ec.label} (${ec.key})`);
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
