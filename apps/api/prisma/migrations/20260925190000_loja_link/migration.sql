-- CreateTable
CREATE TABLE "store_settings" (
    "companyId" TEXT NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "store_slugs" (
    "slug" VARCHAR(40) NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_slugs_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_slug_key" ON "store_settings"("slug");

-- CreateIndex
CREATE INDEX "store_slugs_companyId_idx" ON "store_slugs"("companyId");

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_slug_fkey" FOREIGN KEY ("slug") REFERENCES "store_slugs"("slug") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_slugs" ADD CONSTRAINT "store_slugs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

