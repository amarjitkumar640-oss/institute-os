import { Prisma, PrismaClient } from "@prisma/client";
import { createEnrollment } from "../enrollments/enrollments.service";
import { generateStudentCode } from "../students/students.service";

interface ConvertInput {
  batchId:       string;
  studentDob?:   Date;
  guardianPhone?: string;
}

export async function convertLead(
  prisma: PrismaClient,
  leadId: string,
  input:  ConvertInput,
  tenantId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const lead = await tx.lead.findFirstOrThrow({ where: { id: leadId, tenantId } });
      if (lead.status === "converted") throw new Error("Lead already converted");

      const student = await tx.student.create({
        data: {
          tenantId,
          fullName:      lead.name,
          phone:         lead.phone,
          dob:           input.studentDob,
          guardianPhone: input.guardianPhone,
          studentCode:   await generateStudentCode(tx, tenantId),
        },
      });

      const enrollment = await createEnrollment(tx, student.id, input.batchId, tenantId);

      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data:  { status: "converted", convertedStudentId: student.id },
      });

      return { student, enrollment, lead: updatedLead };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
