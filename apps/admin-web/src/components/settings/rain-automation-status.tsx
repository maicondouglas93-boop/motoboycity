import type { SurchargeRainAutomation } from '@motoboycity/types';

const labels: Record<SurchargeRainAutomation['status'], string> = {
  DISABLED: 'Automação desligada no servidor.',
  NOT_CONFIGURED: 'Aguardando configuração da taxa no servidor.',
  UNAVAILABLE:
    'Sem dados recentes. A cobrança automática não está ativa; o controle manual continua disponível.',
  RAINING: 'Chuva indicada pelo modelo: ativação automática em vigor.',
  DRYING:
    'Sem nova indicação de chuva. Aguardando completar 30 minutos para desligar a ativação automática.',
  DRY: 'Sem indicação de chuva: ativação automática desligada.',
};

export function RainAutomationStatus({
  automation,
  enabled,
}: {
  automation: SurchargeRainAutomation;
  enabled: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm" role="status">
      <p className="font-medium">Clima automático · {automation.reference}</p>
      {automation.accessMode === 'PUBLIC' && (
        <p className="mt-1 text-xs text-muted-foreground">
          Endpoint público sem chave. Confira a licença de uso comercial do Open-Meteo antes de
          ativar em produção.
        </p>
      )}
      <p className="mt-1 text-muted-foreground">
        {enabled
          ? labels[automation.status]
          : 'Taxa desativada pelo ADM. O clima não pode ligá-la.'}
      </p>
      {automation.observedAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          Dado meteorológico de{' '}
          {new Date(automation.observedAt).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            dateStyle: 'short',
            timeStyle: 'short',
          })}{' '}
          (Brasília).
        </p>
      )}
    </div>
  );
}
