-- Uma entrega só pode ter uma oferta pendente por vez. A aplicação trata a
-- colisão como corrida normal de dispatch, mas a constraint mantém essa
-- invariante mesmo para processos concorrentes ou futuros pontos de escrita.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "delivery_offers"
    WHERE "response" = 'PENDING'
    GROUP BY "deliveryId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Não é possível criar o índice único de ofertas pendentes: há entregas com mais de uma oferta PENDING.';
  END IF;
END $$;

CREATE UNIQUE INDEX "delivery_offers_one_pending_per_delivery_key"
  ON "delivery_offers"("deliveryId")
  WHERE "response" = 'PENDING';
