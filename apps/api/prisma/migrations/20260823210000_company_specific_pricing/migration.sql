-- AlterTable
ALTER TABLE "pricing_tables" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE INDEX "pricing_tables_companyId_idx" ON "pricing_tables"("companyId");

-- CreateIndex
CREATE INDEX "pricing_tables_regionId_serviceTypeId_companyId_active_idx" ON "pricing_tables"("regionId", "serviceTypeId", "companyId", "active");

-- AddForeignKey
ALTER TABLE "pricing_tables" ADD CONSTRAINT "pricing_tables_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
