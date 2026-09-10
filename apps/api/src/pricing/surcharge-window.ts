import { dateInSaoPaulo, saoPauloDateParts } from '../common/sao-paulo-time';
import { effectiveWeekday, rangeCoversMinute } from '../common/time-window';

/**
 * Quando uma taxa adicional está valendo.
 *
 * Basta uma condição: o interruptor manual, uma janela agendada (feriado e
 * madrugada) ou a decisão climática já validada. O interruptor geral vence todas.
 *
 * Tudo é avaliado no relógio da operação. Uma janela "sexta das 18h às 23h" é
 * sexta em Lajinha, não em UTC — em UTC essa faixa cai parcialmente no sábado.
 */
export interface SurchargeScheduleWindow {
  /** 0 = domingo .. 6 = sábado. `null` vale para qualquer dia da semana. */
  weekday: number | null;
  /** Datas civis "AAAA-MM-DD". `null` significa sem limite daquele lado. */
  startDate: string | null;
  endDate: string | null;
  /** Minutos desde a meia-noite local. */
  startMinute: number;
  endMinute: number;
}

export interface SurchargeRule {
  active: boolean;
  manuallyActive: boolean;
  /** Decisão climática já validada pelo servidor; ausente nas regras legadas. */
  weatherActive?: boolean;
  schedules: SurchargeScheduleWindow[];
}

function windowCoversDate(window: SurchargeScheduleWindow, dateOnly: string): boolean {
  if (window.startDate !== null && dateOnly < window.startDate) return false;
  if (window.endDate !== null && dateOnly > window.endDate) return false;
  return true;
}

/** A taxa está valendo neste instante? */
export function isSurchargeActiveAt(rule: SurchargeRule, at: Date): boolean {
  // O interruptor geral vem antes de tudo: desativada não vale nem manual nem
  // agendada.
  if (!rule.active) return false;
  if (rule.manuallyActive || rule.weatherActive) return true;

  const parts = saoPauloDateParts(at);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const dateOnly = dateInSaoPaulo(at);

  return rule.schedules.some((window) => {
    if (!rangeCoversMinute(window, minuteOfDay)) return false;
    if (!windowCoversDate(window, dateOnly)) return false;
    if (window.weekday === null) return true;
    return window.weekday === effectiveWeekday(window, parts.weekday, minuteOfDay);
  });
}
