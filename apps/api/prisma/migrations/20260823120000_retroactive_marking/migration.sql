-- Marcacao retroativa: o motoboy esqueceu de tocar o botao e informa depois a
-- que horas a etapa aconteceu de verdade.

-- `changedAt` continua sendo quando a linha foi ESCRITA. `occurredAt` guarda o
-- horario declarado, e so existe quando os dois diferem — por isso e nulavel e
-- nao tem default: linha sem declaracao nenhuma nao deve fingir ter uma.
ALTER TABLE "delivery_status_history" ADD COLUMN "occurredAt" TIMESTAMP(3);

-- Intervalo minimo que a declaracao precisa respeitar entre uma etapa e a
-- seguinte. Nulo = sem restricao, seguindo a convencao da tabela: campo nao
-- configurado nao inventa valor.
ALTER TABLE "platform_settings" ADD COLUMN "minMinutesBeforeCollect" INTEGER;
ALTER TABLE "platform_settings" ADD COLUMN "minMinutesBeforeDeliver" INTEGER;
