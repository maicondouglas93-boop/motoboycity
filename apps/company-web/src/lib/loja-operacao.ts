import type { EventoDoCliente, EventoDoLojista } from './loja-avisos';
import {
  horariosParaAgendar,
  type DiaParaAgendar,
  type Funcionamento,
  type RegrasDoAgendamento,
} from './loja-horario';
import type { Modalidade, ModoDeAceite } from './loja-pedido';

/**
 * Como a loja funciona: horário, tipos de pedido, agendamento, recebimento e
 * avisos. É o que o painel configura em Horários, Tipos de pedido e
 * Notificações — e o que a página do cliente obedece.
 *
 * Aqui fica o FORMATO, que é o que a integração vai gravar. Os valores de
 * exemplo ficam no `loja-mock.ts`, que será apagado.
 *
 * Os tempos ficam num lugar só, no recebimento. O "tempo estimado" da entrega e
 * o "tempo de preparo" da retirada são o que o cliente VÊ desses dois números,
 * e não campos à parte: com um campo para cada, os três acabariam discordando,
 * e o cliente leria uma previsão que a cozinha nunca prometeu.
 */

/** O mesmo formato do endereço da empresa. */
export interface EnderecoDeRetirada {
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
}

export interface NotificacaoDoLojista {
  push: boolean;
  som: boolean;
}

export interface OperacaoDaLoja {
  funcionamento: Funcionamento;
  recebimento: {
    modo: ModoDeAceite;
    /** Padrão. No aceite manual, a loja pode mudar pedido a pedido ao aceitar. */
    minutosDePreparo: number;
    /** O caminho do motoboy, da loja até o cliente, em média. */
    minutosDeEntrega: number;
  };
  entrega: {
    ativa: boolean;
    /** Conta só os itens, sem a taxa. `null`: sem mínimo. */
    pedidoMinimo: number | null;
    agendamento: boolean;
  };
  retirada: {
    ativa: boolean;
    /** `null`: o endereço da empresa, o mesmo de onde o motoboy retira. */
    endereco: EnderecoDeRetirada | null;
    /** "Retire no balcão lateral, com o número do pedido." */
    instrucoes: string;
    agendamento: boolean;
  };
  agendamento: RegrasDoAgendamento & { permitir: boolean };
  notificacoes: {
    lojista: Record<EventoDoLojista, NotificacaoDoLojista>;
    minutosAntesDeFechar: number;
    /** No aceite manual, o som repete enquanto houver pedido esperando. */
    repetirSom: boolean;
    cliente: Record<EventoDoCliente, boolean>;
  };
}

/** A folga da janela de entrega: o caminho varia, e a previsão mostra isso. */
export const FOLGA_DA_ENTREGA_MIN = 15;

export function modalidadesAtivas(operacao: OperacaoDaLoja): Modalidade[] {
  const lista: Modalidade[] = [];
  if (operacao.entrega.ativa) lista.push('ENTREGA');
  if (operacao.retirada.ativa) lista.push('RETIRADA');
  return lista;
}

/**
 * O agendamento vale por modalidade, mas depende da chave geral: desligar
 * "Pedido agendado" desliga nas duas, sem apagar a escolha de cada uma.
 */
export function agendamentoLigado(operacao: OperacaoDaLoja, modalidade: Modalidade): boolean {
  if (!operacao.agendamento.permitir) return false;
  return modalidade === 'ENTREGA'
    ? operacao.entrega.ativa && operacao.entrega.agendamento
    : operacao.retirada.ativa && operacao.retirada.agendamento;
}

/** Quanto antes do horário do cliente a cozinha começa: o preparo, e o caminho na entrega. */
export function minutosAntesDoHorario(operacao: OperacaoDaLoja, modalidade: Modalidade): number {
  const { minutosDePreparo, minutosDeEntrega } = operacao.recebimento;
  return minutosDePreparo + (modalidade === 'ENTREGA' ? minutosDeEntrega : 0);
}

export function horariosDaModalidade(
  operacao: OperacaoDaLoja,
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
export function textoDoTempo(operacao: OperacaoDaLoja, modalidade: Modalidade): string {
  const base = minutosAntesDoHorario(operacao, modalidade);
  return modalidade === 'ENTREGA' ? `${base} a ${base + FOLGA_DA_ENTREGA_MIN} min` : `${base} min`;
}

/**
 * O mínimo só vale na entrega. Ele existe para a taxa não comer a venda — um
 * sorvete de R$ 6,00 com R$ 8,00 de entrega. Na retirada não há taxa, e exigir
 * mínimo ali só recusaria venda.
 */
export function pedidoMinimoDa(operacao: OperacaoDaLoja, modalidade: Modalidade): number | null {
  return modalidade === 'ENTREGA' ? operacao.entrega.pedidoMinimo : null;
}
