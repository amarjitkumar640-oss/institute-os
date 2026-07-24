import { Prisma, PrismaClient } from "@prisma/client";
import { getSignedPhotoUrl } from "../../lib/s3";

type Tx = PrismaClient | Prisma.TransactionClient;

export async function generateStudentCode(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INS-${year}-`;
  const count = await tx.student.count({
    where: { studentCode: { startsWith: prefix } },
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
