/**
 * Janela de horário no relógio da operação.
 *
 * Vive isolada porque duas coisas dependem dela — taxa adicional e horário de
 * funcionamento — e a parte difícil é a mesma nas duas: a virada da meia-noite.
 * Duas implementações disso divergiriam, e o erro apareceria como cobrança
 * indevida ou loja fechada na hora errada.
 */
export interface MinuteRange {
  /** Minutos desde a meia-noite local. */
  startMinute: number;
  endMinute: number;
}

/**
 * A faixa cobre o minuto informado?
 *
 * Fechada no início e ABERTA no fim: 18:00–23:00 inclui 18:00 e exclui 23:00.
 * Sem isso, duas faixas encostadas — 18:00–23:00 e 23:00–02:00 — se
 * sobreporiam exatamente às 23:00.
 */
export function rangeCoversMinute(range: MinuteRange, minuteOfDay: number): boolean {
  if (range.startMinute === range.endMinute) {
    return false;
  }
  if (range.startMinute < range.endMinute) {
    return minuteOfDay >= range.startMinute && minuteOfDay < range.endMinute;
  }
  /**
   * Fim antes do início significa atravessar a meia-noite — madrugada, ou um
   * bar que fecha às 2h. Valem os dois pedaços: do início até o fim do dia, e
   * do começo do dia até o fim da faixa.
   */
  return minuteOfDay >= range.startMinute || minuteOfDay < range.endMinute;
}

/** A faixa atravessa a meia-noite? */
export function rangeCrossesMidnight(range: MinuteRange): boolean {
  return range.endMinute <= range.startMinute;
}

/**
 * O dia da semana a comparar quando a faixa atravessa a meia-noite.
 *
 * Numa faixa de 22:00 às 02:00 marcada como sexta, a 01:00 já é sábado no
 * calendário — mas pertence à noite de sexta, que é o que a operação quis
 * dizer. Por isso, no pedaço depois da meia-noite, compara-se com o dia
 * anterior.
 */
export function effectiveWeekday(range: MinuteRange, weekday: number, minuteOfDay: number): number {
  if (rangeCrossesMidnight(range) && minuteOfDay < range.endMinute) {
    return (weekday + 6) % 7;
  }
  return weekday;
}
