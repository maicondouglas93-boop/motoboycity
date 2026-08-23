-- Limites que acendem o alerta na fila ao vivo, por etapa em que o pedido esta
-- parado. Nulo = sem sinalizacao para aquela etapa, seguindo a convencao da
-- tabela: campo nao configurado nao inventa valor.
ALTER TABLE "platform_settings" ADD COLUMN "slaAlertMinutesToAccept" INTEGER;
ALTER TABLE "platform_settings" ADD COLUMN "slaAlertMinutesToCollect" INTEGER;
ALTER TABLE "platform_settings" ADD COLUMN "slaAlertMinutesToDeliver" INTEGER;
