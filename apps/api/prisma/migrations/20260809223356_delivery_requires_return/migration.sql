-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "requiresReturn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnValue" DECIMAL(10,2);
