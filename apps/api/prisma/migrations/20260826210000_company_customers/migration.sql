-- CreateTable
CREATE TABLE "company_customers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "phone" VARCHAR(11) NOT NULL,
    "street" VARCHAR(160) NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "complement" VARCHAR(120),
    "city" VARCHAR(120) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zip" VARCHAR(8) NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "referenceNote" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_customers_companyId_normalizedName_idx" ON "company_customers"("companyId", "normalizedName");

-- CreateIndex
CREATE INDEX "company_customers_companyId_createdAt_idx" ON "company_customers"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "company_customers_companyId_cpf_key" ON "company_customers"("companyId", "cpf");

-- CreateIndex
CREATE UNIQUE INDEX "company_customers_companyId_phone_key" ON "company_customers"("companyId", "phone");

-- AddForeignKey
ALTER TABLE "company_customers" ADD CONSTRAINT "company_customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
