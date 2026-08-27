-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN "companyCustomerId" TEXT;

-- CreateTable
CREATE TABLE "company_customer_saved_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "normalizedLabel" VARCHAR(40) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
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

    CONSTRAINT "company_customer_saved_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_customer_saved_addresses_customerId_isPrimary_idx"
ON "company_customer_saved_addresses"("customerId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "company_customer_saved_addresses_customerId_normalizedLabel_key"
ON "company_customer_saved_addresses"("customerId", "normalizedLabel");

-- CreateIndex
CREATE INDEX "deliveries_companyCustomerId_createdAt_idx"
ON "deliveries"("companyCustomerId", "createdAt");

-- AddForeignKey
ALTER TABLE "company_customer_saved_addresses"
ADD CONSTRAINT "company_customer_saved_addresses_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "company_customers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries"
ADD CONSTRAINT "deliveries_companyCustomerId_fkey"
FOREIGN KEY ("companyCustomerId") REFERENCES "company_customers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- BackfillAddress
-- Every existing customer keeps its current embedded address as the required primary address.
INSERT INTO "company_customer_saved_addresses" (
    "id",
    "customerId",
    "label",
    "normalizedLabel",
    "isPrimary",
    "street",
    "number",
    "complement",
    "city",
    "state",
    "zip",
    "lat",
    "lng",
    "referenceNote",
    "createdAt",
    "updatedAt"
)
SELECT
    substr(md5(c."id" || ':primary-address'), 1, 8) || '-' ||
    substr(md5(c."id" || ':primary-address'), 9, 4) || '-' ||
    '4' || substr(md5(c."id" || ':primary-address'), 14, 3) || '-' ||
    '8' || substr(md5(c."id" || ':primary-address'), 18, 3) || '-' ||
    substr(md5(c."id" || ':primary-address'), 21, 12),
    c."id",
    'Principal',
    'principal',
    true,
    c."street",
    c."number",
    c."complement",
    c."city",
    c."state",
    c."zip",
    c."lat",
    c."lng",
    c."referenceNote",
    c."createdAt",
    c."updatedAt"
FROM "company_customers" AS c;

-- BackfillDeliveryCustomer
-- Link previous deliveries by company and normalized recipient phone without changing snapshots.
UPDATE "deliveries" AS d
SET "companyCustomerId" = c."id"
FROM "company_customers" AS c
WHERE d."companyId" = c."companyId"
  AND d."companyCustomerId" IS NULL
  AND d."recipientPhone" IS NOT NULL
  AND (
    CASE
      WHEN length(regexp_replace(d."recipientPhone", '[^0-9]', '', 'g')) IN (12, 13)
        AND left(regexp_replace(d."recipientPhone", '[^0-9]', '', 'g'), 2) = '55'
      THEN substring(regexp_replace(d."recipientPhone", '[^0-9]', '', 'g') FROM 3)
      ELSE regexp_replace(d."recipientPhone", '[^0-9]', '', 'g')
    END
  ) = c."phone";
