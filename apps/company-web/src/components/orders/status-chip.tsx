import type { DeliveryStatus } from '@motoboycity/types';

type Tone = 'aguardando' | 'rota' | 'entregue' | 'cancelado' | 'pagamento';

/**
 * Fonte única do rótulo e da cor de cada status.
 *
 * Antes cada tela repetia o próprio mapa de rótulos e usava `Badge secondary`
 * para tudo — ou seja, sete estados diferentes com a mesma aparência, numa
 * tela cujo trabalho é justamente dar o estado num relance.
 *
 * `inMotion` marca os estados em que existe motoboy se deslocando. É o que
 * autoriza o âmbar: a cor significa uma coisa só no produto inteiro.
 */
const STATUS: Record<DeliveryStatus, { label: string; tone: Tone; inMotion?: boolean }> = {
  SCHEDULED: { label: 'Agendado', tone: 'aguardando' },
  AWAITING_DRIVER: { label: 'Buscando motoboy', tone: 'aguardando' },
  ACCEPTED: { label: 'A caminho da coleta', tone: 'rota', inMotion: true },
  COLLECTED: { label: 'Em rota', tone: 'rota', inMotion: true },
  DELIVERED: { label: 'Voltando à loja', tone: 'rota', inMotion: true },
  COMPLETED: { label: 'Concluído', tone: 'entregue' },
  CANCELLED: { label: 'Cancelado', tone: 'cancelado' },
  AWAITING_PAYMENT: { label: 'Aguardando pagamento', tone: 'pagamento' },
};

const TONE_CLASS: Record<Tone, string> = {
  aguardando: 'bg-status-aguardando/10 text-status-aguardando',
  rota: 'bg-status-rota/15 text-[#8a5200]',
  entregue: 'bg-status-entregue/10 text-status-entregue',
  cancelado: 'bg-status-cancelado/10 text-status-cancelado',
  pagamento: 'bg-status-pagamento/10 text-status-pagamento',
};

const DOT_CLASS: Record<Tone, string> = {
  aguardando: 'bg-status-aguardando',
  rota: 'bg-status-rota',
  entregue: 'bg-status-entregue',
  cancelado: 'bg-status-cancelado',
  pagamento: 'bg-status-pagamento',
};

export function statusLabel(status: DeliveryStatus): string {
  return STATUS[status].label;
}

/** Para popular filtros sem que cada tela reconstrua a lista. */
export const STATUS_OPTIONS = (Object.keys(STATUS) as DeliveryStatus[]).map((value) => ({
  value,
  label: STATUS[value].label,
}));

export function statusTone(status: DeliveryStatus): Tone {
  return STATUS[status].tone;
}

export function isInMotion(status: DeliveryStatus): boolean {
  return STATUS[status].inMotion === true;
}

/** Faixa vertical usada na borda dos cards — a rota traçada do pedido. */
export function statusRailClass(status: DeliveryStatus): string {
  return DOT_CLASS[STATUS[status].tone];
}

/**
 * Hex cru, para quem não consegue ler variável CSS — hoje os marcadores do
 * Google Maps. Mantido aqui para o marcador no mapa e o chip na lista nunca
 * discordarem sobre a cor do mesmo pedido.
 *
 * Precisa acompanhar `--status-*` em `globals.css`.
 */
const TONE_HEX: Record<Tone, string> = {
  aguardando: '#5c626b',
  rota: '#ff9e00',
  entregue: '#0b6e4f',
  cancelado: '#d92d20',
  pagamento: '#1d4ed8',
};

export function statusHex(status: DeliveryStatus): string {
  return TONE_HEX[STATUS[status].tone];
}

export function StatusChip({
  status,
  className = '',
}: {
  status: DeliveryStatus;
  className?: string;
}) {
  const { label, tone, inMotion } = STATUS[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      <span className={`relative size-1.5 rounded-full ${DOT_CLASS[tone]}`}>
        {inMotion && (
          <span
            className={`absolute inset-0 animate-ping rounded-full opacity-70 motion-reduce:hidden ${DOT_CLASS[tone]}`}
          />
        )}
      </span>
      {label}
    </span>
  );
}
