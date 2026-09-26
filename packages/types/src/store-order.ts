import type { FormaDePagamento, QuemEntrega } from './store-operation.js';

/**
 * O pedido da loja online: o que o cliente comprou na página da loja.
 *
 * O pedido NÃO é a entrega. O pedido é o que a loja vendeu; a entrega é a
 * corrida do motoboy, com o `DeliveryStatus` dela. As regras do caminho (que
 * etapa vem depois de qual, até quando dá para cancelar) estão em
 * `@motoboycity/validation`, `store-order.rules.ts`.
 *
 * Os nomes são os das telas, em português, como os da operação da loja: é o
 * mesmo formato que o painel e a página do cliente mostram.
 */

export type Modalidade = 'ENTREGA' | 'RETIRADA';

export type EtapaDoPedido =
  'NOVO' | 'ACEITO' | 'EM_PREPARO' | 'PRONTO' | 'SAIU_PARA_ENTREGA' | 'ENTREGUE' | 'CANCELADO';

export interface PassoDoPedido {
  etapa: EtapaDoPedido;
  /** ISO. */
  em: string;
}

/**
 * Quem cancelou. Importa para o aviso: a loja não precisa ser avisada do que
 * ela mesma cancelou, mas precisa saber quando foi o cliente ou o sistema.
 */
export type AutorDoCancelamento = 'LOJA' | 'CLIENTE' | 'SISTEMA';

export interface Cancelamento {
  motivo: string;
  por: AutorDoCancelamento;
}

/** A janela que o cliente escolheu ao agendar. ISO nas duas pontas. */
export interface JanelaAgendada {
  inicio: string;
  fim: string;
}

/** O que o caminho do pedido precisa saber — o resto do pedido não entra aqui. */
export interface AndamentoDoPedido {
  numero: number;
  modalidade: Modalidade;
  etapa: EtapaDoPedido;
  historico: PassoDoPedido[];
  /** `null`: o quanto antes. */
  janela: JanelaAgendada | null;
  /** Congelados no pedido: mudar o padrão depois não muda a promessa já feita. */
  minutosDePreparo: number;
  minutosDeEntrega: number;
  cancelamento: Cancelamento | null;
  /**
   * Na entrega, quem leva — congelado no pedido pelo mesmo motivo dos tempos:
   * mudar a configuração não troca quem já está levando. `null` na retirada.
   */
  entregaPor: QuemEntrega | null;
}

/** Para onde levar. O bairro é o nome, como ele estava na lista da loja. */
export interface EnderecoDaEntrega {
  rua: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  referencia: string | null;
}

/**
 * Uma linha do pedido como foi vendida: nomes e preços da hora da compra. Mudar
 * o cardápio depois não muda o que o cliente comprou.
 */
export interface ItemDoPedido {
  produtoId: string;
  nome: string;
  tamanho: string | null;
  escolhas: string[];
  quantidade: number;
  /** Preço de uma unidade, com tamanho e escolhas. */
  unitario: number;
  total: number;
}

/** O pedido inteiro, como a página do cliente e o painel o mostram. */
export interface PedidoDaLoja extends AndamentoDoPedido {
  id: string;
  /** ISO. */
  criadoEm: string;
  cliente: { nome: string; telefone: string };
  itens: ItemDoPedido[];
  subtotal: number;
  /** Zero na retirada. */
  taxaDeEntrega: number;
  total: number;
  pagamento: FormaDePagamento;
  /** Só no dinheiro: para quanto o cliente precisa de troco. */
  trocoPara: number | null;
  /** `null` na retirada. */
  entrega: EnderecoDaEntrega | null;
  /** "Sem cebola", "portão azul". */
  observacao: string | null;
}
