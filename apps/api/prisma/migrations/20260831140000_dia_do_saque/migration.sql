-- Dia da semana em que o motoboy pode SOLICITAR saque.
--
-- Aditiva e com DEFAULT 1: as linhas existentes recebem segunda-feira, que é
-- exatamente a regra fixa que existia antes deste campo. Nada muda ate alguem
-- trocar o valor de proposito.
--
-- NULL passa a significar "qualquer dia", e nao "sem configuracao".
ALTER TABLE "platform_settings" ADD COLUMN     "withdrawalWeekday" INTEGER DEFAULT 1;
