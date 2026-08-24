/** Fuso da operação. Resolvido pelo Intl, nunca somando -3 na mão. */
const FUSO = 'America/Sao_Paulo';

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

/**
 * `R$ 1.661,34`.
 *
 * Aqui EXISTE formatador de moeda, ao contrário do painel do admin.
 *
 * Lá ele é proibido porque o `useMoney()` aplica a máscara `R$ ••••` quando o
 * dono esconde os valores para mostrar a tela a terceiros, e um segundo
 * formatador furaria essa máscara em silêncio. A loja olha o próprio dinheiro
 * na própria tela: o problema não existe deste lado do balcão.
 *
 * Aceita `null` porque a API devolve nulo em campo sem valor ainda — entrega
 * sem destino conhecido, por exemplo.
 */
export function formatarDinheiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return MOEDA.format(valor);
}

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

/** Um dia civil puro, `AAAA-MM-DD`, sem hora e sem fuso. */
const DIA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `23/08/2026`, sempre no horário da operação.
 *
 * Trata dia civil e instante de formas diferentes, de propósito:
 *
 * - **`2026-08-24`** é um dia, não um momento. `new Date()` leria isso como
 *   meia-noite UTC e a conversão para São Paulo devolveria o DIA ANTERIOR —
 *   foi assim que uma fatura chamada `FAT-20260824` aparecia como 23/08.
 * - **`2026-08-24T18:30:00Z`** é um instante, e aí a conversão de fuso é
 *   exatamente o que se quer: importa que dia era em Lajinha naquela hora.
 */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';

  const diaCivil = DIA_CIVIL.exec(iso);
  if (diaCivil) {
    const [, ano, mes, dia] = diaCivil;
    return `${dia}/${mes}/${ano}`;
  }

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
