-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "destinationKnownAtCreation" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "totalValue" DROP NOT NULL,
ALTER COLUMN "driverValue" DROP NOT NULL,
ALTER COLUMN "platformValue" DROP NOT NULL;

-- AlterTable
ALTER TABLE "delivery_addresses" ALTER COLUMN "street" DROP NOT NULL,
ALTER COLUMN "number" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "state" DROP NOT NULL,
ALTER COLUMN "zip" DROP NOT NULL;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "returnProximityRadiusMeters" INTEGER;
