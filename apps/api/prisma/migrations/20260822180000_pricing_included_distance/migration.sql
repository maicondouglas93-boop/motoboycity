-- Distancia ja coberta pela taxa base ("bandeirada").
--
-- Ate aqui o perKmFee incidia a partir do metro zero, entao nao havia como
-- dizer "ate 3 km custa R$ 8". O default 0 preserva exatamente o
-- comportamento das tabelas ja existentes: sem distancia inclusa, a formula
-- continua sendo baseFee + perKmFee * distancia.
ALTER TABLE "pricing_tables"
  ADD COLUMN "includedDistanceKm" DECIMAL(6,2) NOT NULL DEFAULT 0;
