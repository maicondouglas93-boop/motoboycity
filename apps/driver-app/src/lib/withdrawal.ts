/** O backend autoriza saques somente na segunda-feira de São Paulo. */
export function isWithdrawalDay(date = new Date()): boolean {
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
    }).format(date) === 'Mon'
  );
}

/** Aceita tanto `1234.56` quanto a escrita brasileira `1.234,56`. */
export function parseWithdrawalAmount(value: string): number {
  const compact = value.trim().replace(/\s/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  return Number(normalized);
}
