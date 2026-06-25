import { Prisma, PrismaClient } from "@prisma/client";
import { createEnrollment } from "../enrollments/enrollments.service";
import { generateStudentCode } from "../students/students.service";

interface ConvertInput {
  batchId: string;
  feePlan: { totalAmount: number; planType: "full" | "installment" };
  studentDob?: Date;
  guardianPhone?: string;
}

export async function convertLead(
  prisma: PrismaClient,
  leadId: string,
  input: ConvertInput
) {
  return prisma.$transaction(
    async (tx) => {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
      if (lead.status === "converted") {
        throw new Error("Lead already converted");
      }

      const student = await tx.student.create({
        data: {
          fullName: lead.name,
          phone: lead.phone,
          dob: input.studentDob,
          guardianPhone: input.guardianPhone,
          studentCode: await generateStudentCode(tx),
        },
      });

      const enrollment = await createEnrollment(tx, student.id, input.batchId);

      const feePlan = await tx.feePlan.create({
        data: {
          enrollmentId: enrollment.id,
          totalAmount: input.feePlan.totalAmount,
          planType: input.feePlan.planType,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: { status: "converted", convertedStudentId: student.id },
      });

      return { student, enrollment, feePlan, lead: updatedLead };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
