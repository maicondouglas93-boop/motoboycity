-- CreateEnum
CREATE TYPE "StoreTheme" AS ENUM ('CLARO', 'ESCURO');

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "actionColor" VARCHAR(7) NOT NULL DEFAULT '#15803d',
ADD COLUMN     "brandColor" VARCHAR(7) NOT NULL DEFAULT '#c2410c',
ADD COLUMN     "logoExternalFileId" VARCHAR(100),
ADD COLUMN     "logoUrl" VARCHAR(500),
ADD COLUMN     "theme" "StoreTheme" NOT NULL DEFAULT 'CLARO';

-- AlterTable
ALTER TABLE "store_operations" ADD COLUMN     "deliveryAreas" JSONB,
ADD COLUMN     "paymentMethods" JSONB;

