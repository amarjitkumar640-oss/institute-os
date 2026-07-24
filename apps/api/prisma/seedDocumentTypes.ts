import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Developer-managed master list of document types students can upload
// during admission (Aadhar scan, marksheet, etc.). Idempotent (upserts on
// the unique `key`) — safe to run on every deploy, and safe to extend later
// by adding another upsert call here for a new document type.
const DOCUMENT_TYPES = [
  { key: "aadhar_card", label: "Aadhar Card", sortOrder: 1 },
  { key: "marksheet",   label: "Marksheet",   sortOrder: 2 },
];

async function main() {
  for (const dt of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({
      where:  { key: dt.key },
      update: { label: dt.label, sortOrder: dt.sortOrder },
      create: dt,
    });
    console.log(`Ensured document type: ${dt.label} (${dt.key})`);
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
