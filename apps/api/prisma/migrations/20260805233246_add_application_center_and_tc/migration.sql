-- AlterTable
ALTER TABLE "admission_applications" ADD COLUMN     "centerId" TEXT,
ADD COLUMN     "tcAcceptedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
