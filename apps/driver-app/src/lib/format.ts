/** Fuso da operacao. Resolvido pelo Intl, nunca somando -3 na mao. */
const FUSO = 'America/Sao_Paulo';

/** `R$ 5,26`. Devolve vazio quando o valor ainda nao existe. */
export function formatarDinheiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/** `2.2km`. Vazio quando a distancia ainda nao foi calculada. */
export function formatarDistancia(km: number | null | undefined): string {
  if (km === null || km === undefined) return '';
  return `${km.toFixed(1)}km`;
}

/** `14:09`, sempre no horario da operacao e nao no do aparelho. */
export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: FUSO,
  });
}

/** `23/08/2026`, para o divisor de dia do historico. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleDateString('pt-BR', { timeZone: FUSO });
}
