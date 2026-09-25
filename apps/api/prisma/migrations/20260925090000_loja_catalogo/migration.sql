-- CreateEnum
CREATE TYPE "StoreProductStatus" AS ENUM ('PUBLISHED', 'DRAFT', 'PAUSED');

-- CreateTable
CREATE TABLE "store_categories" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "imageUrl" VARCHAR(500),
    "price" DECIMAL(10,2),
    "status" "StoreProductStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_product_sizes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "store_product_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_option_groups" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "minChoices" INTEGER NOT NULL DEFAULT 0,
    "maxChoices" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "store_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "store_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_categories_companyId_position_idx" ON "store_categories"("companyId", "position");

-- CreateIndex
CREATE INDEX "store_products_companyId_categoryId_position_idx" ON "store_products"("companyId", "categoryId", "position");

-- CreateIndex
CREATE INDEX "store_products_companyId_status_idx" ON "store_products"("companyId", "status");

-- CreateIndex
CREATE INDEX "store_product_sizes_productId_position_idx" ON "store_product_sizes"("productId", "position");

-- CreateIndex
CREATE INDEX "store_option_groups_productId_position_idx" ON "store_option_groups"("productId", "position");

-- CreateIndex
CREATE INDEX "store_options_groupId_position_idx" ON "store_options"("groupId", "position");

-- AddForeignKey
ALTER TABLE "store_categories" ADD CONSTRAINT "store_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "store_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_product_sizes" ADD CONSTRAINT "store_product_sizes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_option_groups" ADD CONSTRAINT "store_option_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "store_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_options" ADD CONSTRAINT "store_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "store_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

