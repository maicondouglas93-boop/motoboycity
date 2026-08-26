-- CreateEnum
CREATE TYPE "InvoiceClosingMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "InvoiceClosingFrequency" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "invoiceClosingFrequency" "InvoiceClosingFrequency" DEFAULT 'WEEKLY',
ADD COLUMN     "invoiceClosingMode" "InvoiceClosingMode" NOT NULL DEFAULT 'AUTOMATIC',
ADD COLUMN     "invoiceClosingMonthDay" INTEGER,
ADD COLUMN     "invoiceClosingWeekday" INTEGER DEFAULT 1,
ADD COLUMN     "invoiceOverdueBlockAfterDays" INTEGER,
ADD COLUMN     "invoiceOverdueBlockedAt" TIMESTAMP(3),
ADD COLUMN     "lastAutomaticInvoiceClosingDate" DATE;

-- CreateTable
CREATE TABLE "company_status_history" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromStatus" "CompanyStatus" NOT NULL,
    "toStatus" "CompanyStatus" NOT NULL,
    "changedByUserId" TEXT,
    "note" VARCHAR(500),
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_status_history_companyId_changedAt_idx" ON "company_status_history"("companyId", "changedAt");

-- AddForeignKey
ALTER TABLE "company_status_history" ADD CONSTRAINT "company_status_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_status_history" ADD CONSTRAINT "company_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
