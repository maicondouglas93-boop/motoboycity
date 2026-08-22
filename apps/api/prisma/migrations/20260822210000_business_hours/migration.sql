-- Horario de funcionamento da operacao.
--
-- Uma linha por intervalo: um dia com pausa de almoco tem duas, e e assim que
-- se fecha o meio do dia sem precisar de um campo de "intervalo".
CREATE TABLE "business_hours" (
  "id"          TEXT NOT NULL,
  "regionId"    TEXT NOT NULL,
  "weekday"     INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute"   INTEGER NOT NULL,
  CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "business_hours_regionId_weekday_idx" ON "business_hours"("regionId", "weekday");

ALTER TABLE "business_hours"
  ADD CONSTRAINT "business_hours_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Desligado por padrao: uma operacao que nunca configurou horario nao pode
-- acordar um dia recusando pedidos porque a tabela esta vazia.
ALTER TABLE "platform_settings"
  ADD COLUMN "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT false;
