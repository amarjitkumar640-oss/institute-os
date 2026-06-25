import { Prisma, PrismaClient } from "@prisma/client";

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
