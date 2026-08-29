-- Restricao reversivel entre motoboy e empresa. Nao altera pedidos existentes;
-- apenas passa a compor a elegibilidade de novos despachos.
CREATE TABLE "driver_company_blocks" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_company_blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_company_blocks_driverId_companyId_key"
ON "driver_company_blocks"("driverId", "companyId");

CREATE INDEX "driver_company_blocks_companyId_driverId_idx"
ON "driver_company_blocks"("companyId", "driverId");

ALTER TABLE "driver_company_blocks"
ADD CONSTRAINT "driver_company_blocks_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_company_blocks"
ADD CONSTRAINT "driver_company_blocks_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
