import type { Modalidade, OperacaoPublica } from '@motoboycity/types';
import { horariosParaAgendar, type DiaParaAgendar } from './store-schedule.rules';

/**
 * Como a loja funciona: horário, tipos de pedido, agendamento, recebimento e
 * avisos. O FORMATO está em `@motoboycity/types` (`OperacaoDaLoja`), que é o
 * que o banco guarda; aqui ficam as contas sobre ele.
 *
 * As contas recebem a operação PÚBLICA — sem os avisos da loja —, porque a
 * página do cliente só tem essa. A operação inteira também serve.
 *
 * Os tempos ficam num lugar só, no recebimento. O "tempo estimado" da entrega e
 * o "tempo de preparo" da retirada são o que o cliente VÊ desses dois números,
 * e não campos à parte: com um campo para cada, os três acabariam discordando,
 * e o cliente leria uma previsão que a cozinha nunca prometeu.
 */

/** A folga da janela de entrega: o caminho varia, e a previsão mostra isso. */
export const FOLGA_DA_ENTREGA_MIN = 15;

export function modalidadesAtivas(operacao: OperacaoPublica): Modalidade[] {
  const lista: Modalidade[] = [];
  if (operacao.entrega.ativa) lista.push('ENTREGA');
  if (operacao.retirada.ativa) lista.push('RETIRADA');
  return lista;
}

/**
 * O agendamento vale por modalidade, mas depende da chave geral: desligar
 * "Pedido agendado" desliga nas duas, sem apagar a escolha de cada uma.
 */
export function agendamentoLigado(operacao: OperacaoPublica, modalidade: Modalidade): boolean {
  if (!operacao.agendamento.permitir) return false;
  return modalidade === 'ENTREGA'
    ? operacao.entrega.ativa && operacao.entrega.agendamento
    : operacao.retirada.ativa && operacao.retirada.agendamento;
}

/** Quanto antes do horário do cliente a cozinha começa: o preparo, e o caminho na entrega. */
export function minutosAntesDoHorario(operacao: OperacaoPublica, modalidade: Modalidade): number {
  const { minutosDePreparo, minutosDeEntrega } = operacao.recebimento;
  return minutosDePreparo + (modalidade === 'ENTREGA' ? minutosDeEntrega : 0);
}

export function horariosDaModalidade(
  operacao: OperacaoPublica,
  modalidade: Modalidade,
  agora: Date,
): DiaParaAgendar[] {
  if (!agendamentoLigado(operacao, modalidade)) return [];
  return horariosParaAgendar(
    operacao.funcionamento,
    operacao.agendamento,
    minutosAntesDoHorario(operacao, modalidade),
    agora,
  );
}

/** O que o cliente vê como previsão: "35 a 50 min" na entrega, "20 min" na retirada. */
export function textoDoTempo(operacao: OperacaoPublica, modalidade: Modalidade): string {
  const base = minutosAntesDoHorario(operacao, modalidade);
  return modalidade === 'ENTREGA' ? `${base} a ${base + FOLGA_DA_ENTREGA_MIN} min` : `${base} min`;
}

/**
 * O mínimo só vale na entrega. Ele existe para a taxa não comer a venda — um
 * sorvete de R$ 6,00 com R$ 8,00 de entrega. Na retirada não há taxa, e exigir
 * mínimo ali só recusaria venda.
 */
export function pedidoMinimoDa(operacao: OperacaoPublica, modalidade: Modalidade): number | null {
  return modalidade === 'ENTREGA' ? operacao.entrega.pedidoMinimo : null;
}
