-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "bankDetails" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "nextInvoiceSeq" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "registeredAddress" TEXT,
ADD COLUMN     "stateCode" TEXT;

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "stateCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship_contracts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "contractedStudentCount" INTEGER NOT NULL,
    "totalContractAmount" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsorship_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_payment_milestones" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMP(3),
    "receivedAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsor_payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsor_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2),
    "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "pdfS3Key" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsor_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sponsorship_contracts_batchId_key" ON "sponsorship_contracts"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_invoices_milestoneId_key" ON "sponsor_invoices"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_invoices_invoiceNumber_key" ON "sponsor_invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sponsor_invoices_shareToken_key" ON "sponsor_invoices"("shareToken");

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_contracts" ADD CONSTRAINT "sponsorship_contracts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_contracts" ADD CONSTRAINT "sponsorship_contracts_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "sponsors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsorship_contracts" ADD CONSTRAINT "sponsorship_contracts_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_payment_milestones" ADD CONSTRAINT "sponsor_payment_milestones_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "sponsorship_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_invoices" ADD CONSTRAINT "sponsor_invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "sponsorship_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsor_invoices" ADD CONSTRAINT "sponsor_invoices_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "sponsor_payment_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
