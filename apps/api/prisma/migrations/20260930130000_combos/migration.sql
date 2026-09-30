-- CreateEnum
CREATE TYPE "StoreProductKind" AS ENUM ('PRODUCT', 'COMBO');

-- AlterTable
ALTER TABLE "store_products" ADD COLUMN     "kind" "StoreProductKind" NOT NULL DEFAULT 'PRODUCT';

-- CreateTable
CREATE TABLE "store_combo_items" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sizeId" TEXT,
    "quantity" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "store_combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_combo_items_comboId_position_idx" ON "store_combo_items"("comboId", "position");

-- CreateIndex
CREATE INDEX "store_combo_items_productId_idx" ON "store_combo_items"("productId");

-- AddForeignKey
ALTER TABLE "store_combo_items" ADD CONSTRAINT "store_combo_items_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

