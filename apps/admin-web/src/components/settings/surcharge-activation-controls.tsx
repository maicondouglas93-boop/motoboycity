import type { SurchargeItem } from '@motoboycity/types';

type Props = {
  surcharge: SurchargeItem;
  pending: boolean;
  onModeChange: (automatic: boolean) => void;
  onManualChange: (on: boolean) => void;
};

/** Estado confirmado pela API: não antecipa visualmente uma mudança de cobrança. */
export function SurchargeActivationControls({
  surcharge,
  pending,
  onModeChange,
  onManualChange,
}: Props) {
  const automatic = surcharge.automaticRainEnabled;
  const weather = surcharge.rainAutomation;
  const configured = Boolean(weather && !['DISABLED', 'NOT_CONFIGURED'].includes(weather.status));
  const buttonClass =
    'min-h-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <fieldset className="min-w-0 space-y-3" disabled={pending}>
      <legend className="mb-3 text-sm font-semibold">Modo de ativação</legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-muted p-1">
        <button
          type="button"
          aria-pressed={!automatic}
          className={`${buttonClass} ${!automatic ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background'}`}
          onClick={() => {
            if (automatic) onModeChange(false);
          }}
        >
          Manual
        </button>
        <button
          type="button"
          aria-pressed={automatic}
          disabled={!configured && !automatic}
          className={`${buttonClass} ${automatic ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background'}`}
          onClick={() => {
            if (!automatic) onModeChange(true);
          }}
        >
          Automática (chuva)
        </button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {automatic
          ? 'Ativação pela estimativa de chuva em Lajinha. Horários e controle manual são ignorados.'
          : surcharge.schedules.length > 0
            ? 'Controle pelo botão ou pelos horários cadastrados. O clima não interfere.'
            : 'Você liga e desliga a cobrança. O clima não interfere.'}
      </p>
      {!automatic && surcharge.schedules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Desligar o manual mantém os horários. Para bloquear tudo, use Desativar taxa.
        </p>
      )}
      {!configured && (
        <p className="text-xs text-muted-foreground">
          Automática indisponível. Consulte os detalhes abaixo.
        </p>
      )}
      {!surcharge.active ? (
        <p className="text-sm font-medium">
          Reative a taxa para usar o modo escolhido. Enquanto desativada, nenhum modo pode cobrar.
        </p>
      ) : !automatic ? (
        <button
          type="button"
          className={`${buttonClass} border bg-background`}
          onClick={() => onManualChange(!surcharge.manuallyActive)}
        >
          {surcharge.manuallyActive ? 'Desligar manual' : 'Ligar manual'}
        </button>
      ) : null}
      {pending && (
        <p role="status" className="text-xs text-muted-foreground">
          Salvando configuração...
        </p>
      )}
    </fieldset>
  );
}
