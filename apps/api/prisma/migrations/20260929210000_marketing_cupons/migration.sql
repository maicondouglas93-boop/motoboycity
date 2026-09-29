
-- CreateEnum
CREATE TYPE "StoreCouponType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "store_orders" ADD COLUMN     "couponCode" VARCHAR(20),
ADD COLUMN     "couponDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "store_coupons" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "type" "StoreCouponType" NOT NULL,
    "percent" INTEGER,
    "amount" DECIMAL(10,2),
    "minOrder" DECIMAL(10,2),
    "maxDiscount" DECIMAL(10,2),
    "startDate" VARCHAR(10),
    "endDate" VARCHAR(10),
    "maxUses" INTEGER,
    "maxUsesPerCustomer" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "productIds" TEXT[],
    "categoryIds" TEXT[],
    "appliesToPromoItems" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerAuthId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_coupons_companyId_active_idx" ON "store_coupons"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "store_coupons_companyId_code_key" ON "store_coupons"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "store_coupon_redemptions_orderId_key" ON "store_coupon_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "store_coupon_redemptions_couponId_customerAuthId_idx" ON "store_coupon_redemptions"("couponId", "customerAuthId");

-- AddForeignKey
ALTER TABLE "store_coupons" ADD CONSTRAINT "store_coupons_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_coupon_redemptions" ADD CONSTRAINT "store_coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "store_coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_coupon_redemptions" ADD CONSTRAINT "store_coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "store_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

