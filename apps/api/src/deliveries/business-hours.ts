import { saoPauloDateParts } from '../common/sao-paulo-time';
import { effectiveWeekday, rangeCoversMinute, type MinuteRange } from '../common/time-window';

/**
 * Horário de funcionamento da operação.
 *
 * Uma faixa por intervalo: um dia com pausa de almoço tem duas, e é assim que
 * se fecha o meio do dia sem inventar um campo de "intervalo". A avaliação é no
 * relógio de Lajinha — em UTC, "fecha às 22h" cairia às 19h para quem opera.
 */
export interface BusinessHourWindow extends MinuteRange {
  /** 0 = domingo .. 6 = sábado. */
  weekday: number;
}

export interface BusinessHoursCheck {
  open: boolean;
  /** Próximo instante em que abre, quando fechado. `null` se nunca abre. */
  nextOpeningLabel: string | null;
}

const WEEKDAY_LABEL = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

function formatMinute(minute: number): string {
  const normalized = minute % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/**
 * A operação está aberta neste instante?
 *
 * Lista vazia significa **aberta**, não fechada. Quem ainda não configurou
 * horário não pode ter os pedidos recusados por omissão — quem liga o bloqueio
 * é o interruptor em PlatformSettings, e ele existe justamente para essa
 * decisão ser explícita.
 */
export function isOpenAt(windows: BusinessHourWindow[], at: Date): boolean {
  if (windows.length === 0) return true;

  const parts = saoPauloDateParts(at);
  const minuteOfDay = parts.hour * 60 + parts.minute;

  return windows.some((window) => {
    if (!rangeCoversMinute(window, minuteOfDay)) return false;
    return window.weekday === effectiveWeekday(window, parts.weekday, minuteOfDay);
  });
}

/**
 * Quando abre de novo, em texto.
 *
 * Uma recusa que diz só "estamos fechados" deixa a loja adivinhando; dizer
 * "abre segunda-feira às 08:00" transforma o erro em instrução. Varre os sete
 * dias a partir de hoje e devolve a primeira abertura à frente.
 */
export function describeNextOpening(windows: BusinessHourWindow[], at: Date): string | null {
  if (windows.length === 0) return null;

  const parts = saoPauloDateParts(at);
  const minuteOfDay = parts.hour * 60 + parts.minute;

  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = (parts.weekday + offset) % 7;
    const candidatas = windows
      .filter((window) => window.weekday === weekday)
      // Hoje só interessa o que ainda está por vir; nos outros dias, tudo.
      .filter((window) => offset > 0 || window.startMinute > minuteOfDay)
      .sort((left, right) => left.startMinute - right.startMinute);

    const proxima = candidatas[0];
    if (!proxima) continue;

    const quando = offset === 0 ? 'hoje' : offset === 1 ? 'amanhã' : WEEKDAY_LABEL[weekday];
    return `${quando} às ${formatMinute(proxima.startMinute)}`;
  }
  return null;
}

export function checkBusinessHours(windows: BusinessHourWindow[], at: Date): BusinessHoursCheck {
  const open = isOpenAt(windows, at);
  return {
    open,
    nextOpeningLabel: open ? null : describeNextOpening(windows, at),
  };
}
