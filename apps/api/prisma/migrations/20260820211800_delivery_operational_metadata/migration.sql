-- CreateEnum
CREATE TYPE "CustomerPaymentMethod" AS ENUM ('PREPAID', 'CARD', 'CASH', 'PIX');

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "customerPaymentMethod" "CustomerPaymentMethod",
ADD COLUMN     "driverNote" TEXT,
ADD COLUMN     "externalOrderNumber" TEXT,
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT;

-- CreateIndex
CREATE INDEX "deliveries_companyId_externalOrderNumber_idx" ON "deliveries"("companyId", "externalOrderNumber");
