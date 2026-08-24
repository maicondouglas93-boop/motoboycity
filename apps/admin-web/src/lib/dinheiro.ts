/** Fuso da operação. Resolvido pelo Intl, nunca somando -3 na mão. */
const FUSO = 'America/Sao_Paulo';

/**
 * NÃO existe formatador de moeda aqui, de propósito.
 *
 * Quem formata dinheiro no painel é o `useMoney()` de `lib/money.tsx`, e ele
 * precisa ser o único: é ele que aplica a máscara `R$ ••••` quando o dono
 * esconde os valores para mostrar a tela a outra pessoa. Um segundo formatador
 * fura essa máscara em silêncio — o valor aparece justamente onde ele achava
 * que tinha escondido.
 *
 * O que mora aqui é o resto: soma sem erro de arredondamento, datas no fuso da
 * operação, e a chave de agrupamento por dia.
 */

/**
 * Soma valores monetários sem erro de ponto flutuante.
 *
 * `0.1 + 0.2` é `0.30000000000000004`, e somando algumas centenas de entregas
 * o total mostrado deixa de bater com o do banco. Como o banco guarda
 * `Decimal(10,2)`, converter para centavos inteiros antes de somar devolve
 * exatamente o mesmo número.
 *
 * Use só para exibir. Total que vira cobrança vem do servidor.
 */
export function somarDinheiro(valores: ReadonlyArray<number | null | undefined>): number {
  const centavos = valores.reduce<number>((total, valor) => {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return total;
    return total + Math.round(valor * 100);
  }, 0);
  return centavos / 100;
}

/** `1.661` — contagem, não dinheiro. */
export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('pt-BR');
}

/** `23/08/2026`, sempre no horário da operação. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR', { timeZone: FUSO });
}

/** `23/08/2026 13:35`, para quando a hora importa (solicitação de saque). */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Chave `AAAA-MM-DD` no fuso da operação, para agrupar por dia.
 *
 * Agrupar por `toISOString().slice(0, 10)` usaria UTC e jogaria todo
 * recebimento depois das 21h para o dia seguinte.
 */
export function chaveDoDia(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  // `en-CA` formata como AAAA-MM-DD, que ordena por texto.
  return data.toLocaleDateString('en-CA', { timeZone: FUSO });
}
