-- AlterTable
ALTER TABLE "faculty" ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "faculty_staffId_key" ON "faculty"("staffId");

-- AddForeignKey
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
