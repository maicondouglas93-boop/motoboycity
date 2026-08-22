-- CreateEnum
CREATE TYPE "DeliveryFailureReason" AS ENUM ('RECIPIENT_ABSENT', 'ADDRESS_NOT_FOUND', 'RECIPIENT_REFUSED', 'OTHER');

-- AlterEnum
ALTER TYPE "DeliveryStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureNote" TEXT,
ADD COLUMN     "failureReason" "DeliveryFailureReason";
