/**
 * Relógio da operação, para a tela mostrar a mesma hora que o servidor usa.
 *
 * O fuso é fixo em Brasília e não o do navegador: os relatórios, as janelas de
 * taxa e o horário de funcionamento são todos avaliados em `America/Sao_Paulo`,
 * e um operador acessando de outro fuso veria a fila com um horário que não
 * bate com o resto do sistema.
 */
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/** Hora do dia, no formato curto que a fila usa. */
export function operationTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return timeFormatter.format(date);
}
