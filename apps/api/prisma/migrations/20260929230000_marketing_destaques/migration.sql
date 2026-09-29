
-- CreateTable
CREATE TABLE "store_highlights" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" VARCHAR(40) NOT NULL,
    "productIds" TEXT[],
    "startDate" VARCHAR(10),
    "endDate" VARCHAR(10),
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_highlights_companyId_active_position_idx" ON "store_highlights"("companyId", "active", "position");

-- AddForeignKey
ALTER TABLE "store_highlights" ADD CONSTRAINT "store_highlights_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

