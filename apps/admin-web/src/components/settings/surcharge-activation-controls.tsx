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
    'rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <fieldset className="mt-3 space-y-2 rounded-lg border p-3" disabled={pending}>
      <legend className="px-1 text-sm font-medium">Modo de ativação</legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!automatic}
          className={`${buttonClass} ${!automatic ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
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
          className={`${buttonClass} ${automatic ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
          onClick={() => {
            if (!automatic) onModeChange(true);
          }}
        >
          Automática (chuva)
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {automatic
          ? 'Só o clima de Lajinha ativa esta taxa. O manual e os horários ficam sem efeito neste modo.'
          : 'O clima não interfere. Use o botão abaixo para ligar ou desligar manualmente.'}
      </p>
      {!automatic && surcharge.schedules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Existem horários cadastrados: eles também podem ativar a taxa neste modo. Para bloquear
          tudo, use Desativar.
        </p>
      )}
      {!configured && (
        <p className="text-xs text-muted-foreground">
          Automática indisponível: habilite o Open-Meteo e vincule o ID desta taxa no servidor.
        </p>
      )}
      {!surcharge.active ? (
        <p className="text-sm font-medium">
          Taxa desativada: nenhum modo pode cobrar. Use Reativar para permitir o modo escolhido.
        </p>
      ) : !automatic ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => onManualChange(!surcharge.manuallyActive)}
        >
          {surcharge.manuallyActive ? 'Desligar manual' : 'Ligar manual'}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Para suspender a cobrança automática, use Desativar. Para assumir o controle, selecione
          Manual.
        </p>
      )}
      {pending && (
        <p role="status" className="text-xs text-muted-foreground">
          Salvando configuração...
        </p>
      )}
    </fieldset>
  );
}
