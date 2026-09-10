import type { SurchargeRainAutomation } from '@motoboycity/types';

const labels: Record<SurchargeRainAutomation['status'], string> = {
  DISABLED: 'Automação desligada no servidor.',
  NOT_CONFIGURED: 'Aguardando configuração da taxa no servidor.',
  UNAVAILABLE: 'Sem dados recentes. Ativação automática indisponível.',
  RAINING: 'Chuva indicada pelo modelo.',
  DRYING:
    'Sem nova indicação de chuva. Aguardando completar 30 minutos para desligar a ativação automática.',
  DRY: 'Sem indicação de chuva: ativação automática desligada.',
};

export function RainAutomationStatus({
  automation,
  enabled,
  automaticEnabled,
}: {
  automation: SurchargeRainAutomation;
  enabled: boolean;
  automaticEnabled: boolean;
}) {
  return (
    <div className="space-y-2 text-sm" role="status">
      <p className="font-semibold">Clima · {automation.reference}</p>
      <p className="leading-relaxed">
        {!enabled
          ? 'Taxa desativada pelo ADM. O clima não pode ligá-la.'
          : !automaticEnabled
            ? 'Modo Manual: o clima não aplica esta taxa.'
            : labels[automation.status]}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Estimativa regional, não confirmação na rua.
        {enabled && automaticEnabled && ' Se não estiver chovendo, use Desativar taxa.'}
      </p>
      {automation.observedAt && (
        <p className="text-xs text-muted-foreground">
          Dado de{' '}
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

/** Informações de integração ficam nos detalhes, fora dos controles do dia a dia. */
export function RainAutomationDetails({
  automation,
}: {
  automation: SurchargeRainAutomation | null;
}) {
  return (
    <div className="space-y-2">
      <p>
        Fonte:{' '}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Open-Meteo
        </a>
        . Referência fixa: Lajinha–MG, sem geocoding recorrente.
      </p>
      {(!automation || ['DISABLED', 'NOT_CONFIGURED'].includes(automation.status)) && (
        <p>Para habilitar o automático, vincule o ID desta taxa ao Open-Meteo no servidor.</p>
      )}
      {automation?.accessMode === 'PUBLIC' && (
        <p>
          Endpoint público sem chave. Confira a licença de uso comercial do Open-Meteo antes de
          ativar em produção.
        </p>
      )}
    </div>
  );
}
