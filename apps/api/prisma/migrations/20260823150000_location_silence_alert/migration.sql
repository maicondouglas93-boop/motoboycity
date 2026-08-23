-- Detector de motoboy com pedido em andamento e rastreamento parado.

-- Nulo = detector desligado, seguindo a convencao da tabela: campo nao
-- configurado nao inventa valor, e uma operacao que nunca configurou nao pode
-- acordar um dia mandando aviso sozinha.
ALTER TABLE "platform_settings" ADD COLUMN "locationSilenceAlertMinutes" INTEGER;

-- Um aviso por EPISODIO de silencio, e nao um a cada rodada do detector.
ALTER TABLE "drivers" ADD COLUMN "locationSilenceAlertedAt" TIMESTAMP(3);
