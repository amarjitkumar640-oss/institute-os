-- AlterTable
ALTER TABLE "sponsor_invoices" ADD COLUMN     "netReceivableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "sponsor_payment_milestones" ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sponsorship_contracts" ADD COLUMN     "tdsRate" DECIMAL(5,2);
