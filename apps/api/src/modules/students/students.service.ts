import { Prisma, PrismaClient } from "@prisma/client";
import { getSignedPhotoUrl } from "../../lib/s3";

type Tx = PrismaClient | Prisma.TransactionClient;

// Letters only, uppercased, padded with "X" if the source is shorter than
// `length` (e.g. a 2-letter slug) — always exactly `length` characters, so
// the resulting code never has a variable-width segment.
function abbreviate(text: string, length = 3): string {
  const letters = text.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return letters.slice(0, length).padEnd(length, "X");
}

// Format: <tenant>-<center>-<year>-<seq>, e.g. "SUC-GHA-2026-0001" — readable
// at a glance which institute+center a student belongs to, unlike the old
// flat "INS-2026-0001" (a literal, tenant-agnostic prefix). Both
// abbreviations are auto-derived (first 3 letters of the tenant's slug and
// the center's name) rather than a separately admin-configured short code —
// no new settings field needed, at the cost of two centers with very
// similar names potentially abbreviating the same way.
//
// The sequence resets per center, not per tenant — matches how a physical
// front desk would number admissions at their own branch, so two centers
// under the same tenant both start at 0001 independently rather than
// sharing one tenant-wide running count.
export async function generateStudentCode(tx: Tx, tenantId: string, centerId: string | null): Promise<string> {
  const [tenant, center] = await Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    centerId ? tx.center.findUnique({ where: { id: centerId }, select: { name: true } }) : null,
  ]);
  const tenantAbbr = abbreviate(tenant?.slug ?? "INS");
  const centerAbbr = abbreviate(center?.name ?? "GEN");
  const year = new Date().getFullYear();
  const prefix = `${tenantAbbr}-${centerAbbr}-${year}-`;

  const count = await tx.student.count({
    where: { tenantId, centerId, studentCode: { startsWith: prefix } },
  });
  const seq = (count + 1).toString().padStart(4, "0");
  return `${prefix}${seq}`;
}

// `photoUrl` stores a bare S3 object key (the bucket is private) — resolve it
// to a fresh short-lived signed URL right before sending a response.
export async function withPhotoUrl<T extends { photoUrl: string | null }>(student: T): Promise<T> {
  if (!student.photoUrl) return student;
  return { ...student, photoUrl: await getSignedPhotoUrl(student.photoUrl) };
}

export async function withPhotoUrls<T extends { photoUrl: string | null }>(students: T[]): Promise<T[]> {
  return Promise.all(students.map(withPhotoUrl));
}

// Documents (Aadhar scan, marksheet, etc.) — dynamic master-data-driven
// uploads, separate from the fixed `photoUrl` above. `fileUrl` stores a bare
// S3 key the same way `photoUrl` does; resolve to a signed URL on the way out.
type StudentDocumentWithType = {
  id:             string;
  documentTypeId: string;
  fileUrl:        string;
  uploadedAt:     Date;
  documentType:   { key: string; label: string };
};

export async function serializeStudentDocument(doc: StudentDocumentWithType) {
  return {
    id:             doc.id,
    documentTypeId: doc.documentTypeId,
    key:            doc.documentType.key,
    label:          doc.documentType.label,
    fileUrl:        await getSignedPhotoUrl(doc.fileUrl),
    uploadedAt:     doc.uploadedAt,
  };
}

export async function serializeStudentDocuments(docs: StudentDocumentWithType[]) {
  return Promise.all(docs.map(serializeStudentDocument));
}
