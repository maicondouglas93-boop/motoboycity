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

/**
 * `AGUARDANDO_PAGAMENTO` vem antes de tudo, só no pedido pago online: a loja
 * não o vê, e ele entra como novo (ou aceito) quando o Asaas confirma o Pix.
 */
export type EtapaDoPedido =
  | 'AGUARDANDO_PAGAMENTO'
  | 'NOVO'
  | 'ACEITO'
  | 'EM_PREPARO'
  | 'PRONTO'
  | 'SAIU_PARA_ENTREGA'
  | 'ENTREGUE'
  | 'CANCELADO';

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

/** O que o cliente marcou num grupo do cardápio: "Frutas", "Adicionais". */
export interface EscolhasDoGrupo {
  /** O nome do grupo, como estava no cardápio na hora da compra. */
  grupo: string;
  opcoes: string[];
}

/**
 * Uma linha do pedido como foi vendida: nomes e preços da hora da compra. Mudar
 * o cardápio depois não muda o que o cliente comprou.
 */
export interface ItemDoPedido {
  produtoId: string;
  nome: string;
  tamanho: string | null;
  /** Todas as escolhas, numa lista só. */
  escolhas: string[];
  /**
   * As mesmas escolhas, agrupadas como no cardápio e na ordem dele; só os
   * grupos em que o cliente marcou algo. Falta nos pedidos feitos antes de o
   * grupo ser gravado — quem lê cai em `escolhas`.
   */
  grupos?: EscolhasDoGrupo[];
  quantidade: number;
  /** Preço de uma unidade, com tamanho e escolhas, SEM promoção. */
  unitario: number;
  /**
   * O que a linha custa, já com a promoção: é o que o cliente paga, e o que a
   * soma do pedido usa. Sem promoção, é `unitario * quantidade`.
   */
  total: number;
  /** Quanto a linha custaria sem a promoção. Ausente: não houve desconto. */
  totalOriginal?: number;
  /** A promoção que baixou a linha, como estava na hora da compra. */
  promocao?: { id: string; nome: string; desconto: number; rotulo: string };
  /**
   * O pedido baixou o estoque deste produto (ele tinha controle na hora da compra). É por
   * este sinal que o cancelamento devolve as unidades: o produto que passou a ter estoque
   * depois do pedido não ganha unidades de um pedido que nunca o baixou.
   */
  baixouEstoque?: boolean;
}

/**
 * Onde está a corrida do MOTOboyCity que leva o pedido — o `DeliveryStatus`
 * dela, com os nomes das telas.
 */
export type SituacaoDaCorrida =
  | 'AGENDADA'
  | 'AGUARDANDO_PAGAMENTO'
  | 'BUSCANDO_MOTOBOY'
  | 'MOTOBOY_A_CAMINHO'
  | 'COLETADA'
  | 'ENTREGUE'
  | 'NAO_ENTREGUE'
  | 'CANCELADA';

/**
 * O pagamento online do pedido, na conta Asaas da loja. `ESTORNANDO` e
 * `ESTORNADO`: o pedido pago foi cancelado, e o dinheiro volta inteiro para o
 * cliente (decisão 18); `ESTORNO_FALHOU`: o Asaas recusou — por exemplo, sem
 * saldo na conta da loja —, e o sistema tenta de novo.
 */
export type SituacaoDoPagamento =
  | 'AGUARDANDO'
  | 'PAGO'
  | 'NAO_PAGO'
  | 'ESTORNANDO'
  | 'ESTORNADO'
  | 'ESTORNO_FALHOU';

export interface PagamentoOnlineDoPedido {
  situacao: SituacaoDoPagamento;
  /** O Pix copia e cola. Só enquanto aguarda. */
  pixCopiaECola: string | null;
  /** O QR code em PNG, base64 sem o prefixo `data:`. Só enquanto aguarda. */
  qrCode: string | null;
  /** ISO. Até quando o Pix vale. */
  expiraEm: string | null;
  /** ISO. */
  pagoEm: string | null;
  /** Só para a loja: o que ela precisa saber do estorno que não saiu. */
  aviso: string | null;
}

/**
 * O Pix direto do pedido: o cliente paga na chave da loja e envia o comprovante
 * pelo WhatsApp dela; a loja confere e confirma em Vendas.
 *
 * `AGUARDANDO`: ainda não confirmado — o pedido já está na fila, com este aviso.
 * `CONFIRMADO`: a loja conferiu o comprovante.
 */
export interface PixDiretoDoPedido {
  situacao: 'AGUARDANDO' | 'CONFIRMADO';
  /**
   * O Pix copia e cola, com o valor do pedido. Só enquanto aguarda, e só para o
   * cliente: pago, ele não deve ser pago de novo.
   */
  copiaECola: string | null;
  /**
   * O WhatsApp da loja, com o DDI (`5533999887766`), para o comprovante. Só o
   * cliente o recebe, junto do QR; a loja já o conhece.
   */
  whatsapp: string | null;
  /** ISO. Quando a loja confirmou. */
  confirmadoEm: string | null;
}

/** A corrida que nasceu do pedido, como Vendas a mostra. */
export interface CorridaDoPedido {
  /** O número da corrida no painel de Pedidos. */
  numero: number;
  situacao: SituacaoDaCorrida;
  /** ISO. Quando a corrida começa a buscar motoboy; `null` se já busca. */
  agendadaPara: string | null;
  /** O nome do motoboy, depois do aceite. */
  motoboy: string | null;
}

/** O pedido inteiro, como a página do cliente e o painel o mostram. */
export interface PedidoDaLoja extends AndamentoDoPedido {
  id: string;
  /** ISO. */
  criadoEm: string;
  cliente: { nome: string; telefone: string };
  itens: ItemDoPedido[];
  /** Os itens já com as promoções, e antes do cupom. */
  subtotal: number;
  /** Zero na retirada. */
  taxaDeEntrega: number;
  /** O cupom usado, como estava na compra. Ausente ou `null`: sem cupom. */
  cupom?: { codigo: string; desconto: number } | null;
  /** `subtotal` menos o cupom, mais a taxa: o que o cliente paga. */
  total: number;
  pagamento: FormaDePagamento;
  /** Só no dinheiro: para quanto o cliente precisa de troco. */
  trocoPara: number | null;
  /** `null` na retirada. */
  entrega: EnderecoDaEntrega | null;
  /** "Sem cebola", "portão azul". */
  observacao: string | null;
  /**
   * A corrida do MOTOboyCity, quando há. Só a loja recebe: para o cliente vem
   * `null`, e ele acompanha pela etapa.
   */
  corrida: CorridaDoPedido | null;
  /** O Pix do pedido pago online. `null`: pagamento na entrega. */
  pagamentoOnline: PagamentoOnlineDoPedido | null;
  /** O Pix direto na chave da loja. Ausente ou `null`: o pedido não é dessa forma. */
  pixDireto?: PixDiretoDoPedido | null;
  /**
   * O que a loja precisa resolver na corrida: ela não nasceu, foi cancelada
   * pela central, o motoboy não conseguiu entregar. `null` quando está tudo
   * certo, e sempre `null` para o cliente.
   */
  avisoDaCorrida: string | null;
}
