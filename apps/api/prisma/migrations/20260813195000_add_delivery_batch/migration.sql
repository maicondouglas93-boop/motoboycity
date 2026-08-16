-- Pedidos criados na mesma chamada podem ser despachados como uma unidade.
-- A tabela de lote é intencionalmente evitada: batchId é um correlacionador
-- imutável e as entregas/ofertas individuais continuam sendo a trilha de auditoria.
ALTER TABLE "deliveries" ADD COLUMN "batchId" TEXT;

CREATE INDEX "deliveries_batchId_idx" ON "deliveries"("batchId");
