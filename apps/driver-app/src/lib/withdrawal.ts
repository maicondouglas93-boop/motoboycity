import type { WithdrawalPolicy } from '@motoboycity/types';

/**
 * O dia do saque NÃO é mais decidido aqui.
 *
 * Havia uma cópia da regra ("segunda-feira") escrita neste arquivo. Com o dia
 * virando configuração do administrador, essa cópia passaria a mentir na
 * primeira troca — bloqueando o botão no dia certo e liberando no errado, cada
 * aparelho com a sua versão da verdade.
 *
 * Agora a decisão vem pronta do servidor, em `DriverWalletSummary.withdrawal`,
 * e a tela só a exibe. Ver `WithdrawalPolicy` em `packages/types`.
 */

/** Aceita tanto `1234.56` quanto a escrita brasileira `1.234,56`. */
export function parseWithdrawalAmount(value: string): number {
  const compact = value.trim().replace(/\s/g, '');
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  return Number(normalized);
}

/** "às terças", mas "aos sábados" — a preposição muda com o dia. */
function comPreposicao(dia: string): string {
  return `${dia === 'sábado' || dia === 'domingo' ? 'aos' : 'às'} ${dia}s`;
}

/**
 * O que a faixa de regra diz, na tela do saque.
 *
 * `null` é o estado em que a carteira ainda não chegou. Ele existe porque
 * afirmar um dia sem ter perguntado ao servidor é exatamente o erro que a
 * cópia local da regra cometia.
 */
export function tituloDaRegra(politica: WithdrawalPolicy | null): string {
  if (!politica) return 'Confirmando o dia com o servidor...';
  if (politica.openToday) return 'Solicitações abertas hoje';
  return politica.weekdayLabel
    ? `Solicitações disponíveis ${comPreposicao(politica.weekdayLabel)}`
    : 'Solicitações fechadas hoje';
}

/** Rótulo do botão quando hoje não é dia. */
export function rotuloDoBotaoFechado(politica: WithdrawalPolicy | null): string {
  if (!politica) return 'Confirmando o dia...';
  return politica.weekdayLabel
    ? `Disponível ${comPreposicao(politica.weekdayLabel)}`
    : 'Indisponível hoje';
}
