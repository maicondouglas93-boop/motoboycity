-- CreateEnum
CREATE TYPE "StorePromotionType" AS ENUM ('PERCENTUAL', 'PRECO', 'LEVE_PAGUE', 'SEGUNDO_COM_DESCONTO');

-- CreateEnum
CREATE TYPE "StorePromotionTarget" AS ENUM ('PRODUTO', 'CATEGORIA');

-- CreateTable
CREATE TABLE "store_promotions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "type" "StorePromotionType" NOT NULL,
    "target" "StorePromotionTarget" NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "percent" INTEGER,
    "promoPrice" DECIMAL(10,2),
    "buyQty" INTEGER,
    "payQty" INTEGER,
    "startDate" VARCHAR(10),
    "endDate" VARCHAR(10),
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "weekdays" INTEGER[],
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_promotions_companyId_active_idx" ON "store_promotions"("companyId", "active");

-- CreateIndex
CREATE INDEX "store_promotions_productId_idx" ON "store_promotions"("productId");

-- CreateIndex
CREATE INDEX "store_promotions_categoryId_idx" ON "store_promotions"("categoryId");

-- AddForeignKey
ALTER TABLE "store_promotions" ADD CONSTRAINT "store_promotions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_promotions" ADD CONSTRAINT "store_promotions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_promotions" ADD CONSTRAINT "store_promotions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "store_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

