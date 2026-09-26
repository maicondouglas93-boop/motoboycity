-- CreateTable
CREATE TABLE "store_operations" (
    "companyId" TEXT NOT NULL,
    "schedule" JSONB NOT NULL,
    "manualStatus" JSONB,
    "orderTypes" JSONB NOT NULL,
    "notifications" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_operations_pkey" PRIMARY KEY ("companyId")
);

-- AddForeignKey
ALTER TABLE "store_operations" ADD CONSTRAINT "store_operations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

