-- CreateEnum
CREATE TYPE "DriverPunishmentTrigger" AS ENUM ('DECLINED', 'EXPIRED', 'DECLINED_OR_EXPIRED');

-- CreateEnum
CREATE TYPE "DriverPunishmentReason" AS ENUM ('DECLINED_OFFER', 'EXPIRED_OFFER');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "driverPunishmentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "driverPunishmentIgnoreWithActiveDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "driverPunishmentMinutes" INTEGER,
ADD COLUMN     "driverPunishmentOfferCount" INTEGER,
ADD COLUMN     "driverPunishmentOncePerDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "driverPunishmentTrigger" "DriverPunishmentTrigger" NOT NULL DEFAULT 'DECLINED';

-- CreateTable
CREATE TABLE "driver_punishments" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "reason" "DriverPunishmentReason" NOT NULL,
    "offerCount" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokedReason" TEXT,

    CONSTRAINT "driver_punishments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_punishments_driverId_expiresAt_idx" ON "driver_punishments"("driverId", "expiresAt");

-- CreateIndex
CREATE INDEX "driver_punishments_driverId_deliveryId_idx" ON "driver_punishments"("driverId", "deliveryId");

-- AddForeignKey
ALTER TABLE "driver_punishments" ADD CONSTRAINT "driver_punishments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_punishments" ADD CONSTRAINT "driver_punishments_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_punishments" ADD CONSTRAINT "driver_punishments_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

