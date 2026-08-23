import { dateInSaoPaulo } from '../../common/sao-paulo-time';

export interface ReportWindow {
  from: Date;
  to: Date;
}

/**
 * A janela anterior comparável: mesma DURAÇÃO exata, imediatamente antes.
 *
 * A comparação por duração é o que torna o número honesto quando o período
 * inclui hoje. O recorte padrão termina AGORA, então ele contém 29 dias
 * inteiros mais as horas já decorridas de hoje — e comparar isso com 30 dias
 * civis completos faria todo indicador parecer em queda, todo dia, até a noite.
 * Espelhando a duração, as duas janelas têm exatamente as mesmas horas.
 *
 * Nenhuma aritmética de calendário aqui, de propósito: só milissegundos. Somar
 * ou subtrair mês é justamente onde o índice base zero de `Date.UTC` já
 * produziu o mês errado neste repositório.
 */
export function previousComparableWindow(current: ReportWindow): ReportWindow {
  const duracao = current.to.getTime() - current.from.getTime();
  const from = new Date(current.from.getTime() - duracao);
  return { from, to: new Date(current.from.getTime()) };
}

/**
 * O recorte termina hoje?
 *
 * Resolvido no servidor, e não no painel: decidir isso exige o fuso da
 * operação, e uma segunda cópia dessa regra do lado do navegador divergiria
 * daquela que monta o próprio recorte. Mesma escolha já feita em `activeNow`
 * das taxas.
 */
export function isLiveWindow(current: ReportWindow, now: Date): boolean {
  return dateInSaoPaulo(current.to) === dateInSaoPaulo(now);
}

/**
 * Variação percentual entre dois períodos.
 *
 * Base zero devolve `null`, e não "infinito" nem "100%": sair de nenhuma
 * entrega para dez não é um crescimento percentual, é um começo — e mostrar
 * qualquer número ali daria a impressão de uma tendência que não existe.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
