import { dateInSaoPaulo, saoPauloDateParts } from '../common/sao-paulo-time';

/**
 * Quando uma taxa adicional está valendo.
 *
 * Duas formas de valer, e basta uma: o interruptor manual, que o admin liga
 * quando começa a chover, ou uma janela agendada, para o que é previsível como
 * feriado e madrugada.
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
  schedules: SurchargeScheduleWindow[];
}

/**
 * A janela cobre o instante informado?
 *
 * A faixa é fechada no início e ABERTA no fim: 18:00–23:00 inclui 18:00 e
 * exclui 23:00. Sem isso, duas janelas encostadas — 18:00–23:00 e 23:00–02:00 —
 * se sobreporiam exatamente às 23:00.
 */
function windowCoversMinute(window: SurchargeScheduleWindow, minuteOfDay: number): boolean {
  if (window.startMinute === window.endMinute) {
    return false;
  }
  if (window.startMinute < window.endMinute) {
    return minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute;
  }
  /**
   * Fim antes do início significa atravessar a meia-noite — o caso da
   * madrugada, 22:00 às 02:00. Aí valem os dois pedaços: do início até o fim do
   * dia, e do começo do dia até o fim da janela.
   */
  return minuteOfDay >= window.startMinute || minuteOfDay < window.endMinute;
}

function windowCoversDate(window: SurchargeScheduleWindow, dateOnly: string): boolean {
  if (window.startDate !== null && dateOnly < window.startDate) return false;
  if (window.endDate !== null && dateOnly > window.endDate) return false;
  return true;
}

/**
 * O dia da semana a comparar quando a janela atravessa a meia-noite.
 *
 * Numa janela de 22:00 às 02:00 marcada como sexta, o pedido da 01:00 já é
 * sábado no calendário — mas pertence à noite de sexta, que é o que a operação
 * quis dizer. Por isso, no pedaço depois da meia-noite, compara-se com o dia
 * anterior.
 */
function effectiveWeekday(
  window: SurchargeScheduleWindow,
  weekday: number,
  minuteOfDay: number,
): number {
  const crossesMidnight = window.endMinute <= window.startMinute;
  if (crossesMidnight && minuteOfDay < window.endMinute) {
    return (weekday + 6) % 7;
  }
  return weekday;
}

/** A taxa está valendo neste instante? */
export function isSurchargeActiveAt(rule: SurchargeRule, at: Date): boolean {
  // O interruptor geral vem antes de tudo: desativada não vale nem manual nem
  // agendada.
  if (!rule.active) return false;
  if (rule.manuallyActive) return true;

  const parts = saoPauloDateParts(at);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  const dateOnly = dateInSaoPaulo(at);

  return rule.schedules.some((window) => {
    if (!windowCoversMinute(window, minuteOfDay)) return false;
    if (!windowCoversDate(window, dateOnly)) return false;
    if (window.weekday === null) return true;
    return window.weekday === effectiveWeekday(window, parts.weekday, minuteOfDay);
  });
}
