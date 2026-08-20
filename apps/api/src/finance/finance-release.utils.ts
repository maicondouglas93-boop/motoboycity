const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function saoPauloDateParts(date: Date): { year: number; month: number; day: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday') ?? '',
  };
}

/** A liberação financeira ocorre toda segunda-feira no fuso operacional. */
export function isMondayInSaoPaulo(date: Date): boolean {
  return saoPauloDateParts(date).weekday === 'Mon';
}

/**
 * A entrega fechada em uma segunda ainda entra no próximo ciclo. O horário
 * em UTC representa 00:00 de São Paulo (UTC-03), preservando a data correta
 * nos extratos do produto.
 */
export function nextMondayReleaseAt(date: Date): Date {
  const parts = saoPauloDateParts(date);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const currentWeekday = localDate.getUTCDay();
  const daysUntilNextMonday = currentWeekday === 1 ? 7 : (8 - currentWeekday) % 7;
  localDate.setUTCDate(localDate.getUTCDate() + daysUntilNextMonday);

  return new Date(
    Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 3, 0, 0),
  );
}
