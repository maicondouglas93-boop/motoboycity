-- Taxa adicional configuravel pelo admin.
--
-- `surcharges` existia como esqueleto da Fase 0, sem uma unica referencia em
-- codigo e sem nenhuma linha gravada em nenhum ambiente. Por isso o enum de
-- MOTIVO (RAIN/PEAK_HOUR/OTHER) pode ser trocado pelo de CALCULO sem migrar
-- dado: o motivo virou nome livre, para o admin criar quantas taxas quiser sem
-- depender de uma migracao a cada motivo novo.

-- O enum antigo so pode sair depois que a coluna que o usa sair.
ALTER TABLE "surcharges" DROP COLUMN "type";
DROP TYPE "SurchargeType";

CREATE TYPE "SurchargeType" AS ENUM ('PERCENTAGE', 'FIXED');

ALTER TABLE "surcharges"
  ADD COLUMN "name" VARCHAR(80) NOT NULL,
  ADD COLUMN "type" "SurchargeType" NOT NULL,
  ADD COLUMN "driverSharePercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "manuallyActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "surcharges_regionId_type_idx";
CREATE INDEX "surcharges_regionId_active_idx" ON "surcharges"("regionId", "active");

-- Janela em que a taxa vale sozinha, sem ninguem acionar o interruptor.
--
-- As datas sao VARCHAR de proposito: um TIMESTAMP aqui viraria meia-noite UTC
-- e deslocaria o feriado em tres horas no fuso da operacao.
CREATE TABLE "surcharge_schedules" (
  "id"          TEXT NOT NULL,
  "surchargeId" TEXT NOT NULL,
  "weekday"     INTEGER,
  "startDate"   VARCHAR(10),
  "endDate"     VARCHAR(10),
  "startMinute" INTEGER NOT NULL,
  "endMinute"   INTEGER NOT NULL,
  CONSTRAINT "surcharge_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "surcharge_schedules_surchargeId_idx" ON "surcharge_schedules"("surchargeId");

ALTER TABLE "surcharge_schedules"
  ADD CONSTRAINT "surcharge_schedules_surchargeId_fkey"
  FOREIGN KEY ("surchargeId") REFERENCES "surcharges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Congelamento na entrega: nome e valor, nao chave estrangeira. Renomear ou
-- excluir a taxa depois nao pode reescrever o que a fatura ja emitida dizia.
ALTER TABLE "deliveries"
  ADD COLUMN "surchargeLabel" VARCHAR(80),
  ADD COLUMN "surchargeValue" DECIMAL(10,2);
