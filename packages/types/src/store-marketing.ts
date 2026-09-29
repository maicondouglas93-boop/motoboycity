/**
 * Marketing da loja online: as promoções que baixam o preço no cardápio e no
 * checkout. Os nomes são os das telas, em português, como no resto dos contratos
 * da loja.
 *
 * O desconto é do PRODUTO (o preço do tamanho escolhido), e não dos adicionais:
 * "20% OFF no açaí" não muda o que custa a granola. É a mesma conta na página, no
 * checkout e no servidor — `store-pricing.rules.ts`, em `@motoboycity/validation`.
 */

/**
 * - `PERCENTUAL`: "20% OFF".
 * - `PRECO`: "de R$ 45,00 por R$ 39,90" — só em produto sem tamanhos, que têm um
 *   preço só para trocar.
 * - `LEVE_PAGUE`: "leve 3, pague 2".
 * - `SEGUNDO_COM_DESCONTO`: "o segundo sai com 50% de desconto".
 */
export type TipoDePromocao = 'PERCENTUAL' | 'PRECO' | 'LEVE_PAGUE' | 'SEGUNDO_COM_DESCONTO';

/** A promoção vale para um produto, ou para todos os de uma seção do cardápio. */
export type AlvoDaPromocao = 'PRODUTO' | 'CATEGORIA';

/**
 * Quando a promoção vale. O que está vazio não limita: sem datas, vale sempre;
 * sem horário, o dia inteiro; sem dias da semana, todos.
 *
 * Datas são do calendário da loja (`AAAA-MM-DD`, as duas pontas incluídas) e
 * horas são do relógio dela — o mesmo fuso do horário de funcionamento. Um
 * horário que termina antes de começar passa da meia-noite (18:00 → 02:00), e o
 * dia da semana é o do dia em que ele COMEÇA.
 */
export interface JanelaDaPromocao {
  inicio: string | null;
  fim: string | null;
  /** `HH:MM`. Vem sempre junto de `horaFim`. */
  horaInicio: string | null;
  horaFim: string | null;
  /** 0 = domingo. Vazio: todos os dias. */
  diasDaSemana: number[];
}

/**
 * O que a página do cliente e o checkout recebem: o suficiente para calcular o
 * preço, e nada do que é só da loja (o limite de usos, quantas vezes já valeu).
 * A promoção esgotada nem chega aqui.
 */
export interface PromocaoPublica extends JanelaDaPromocao {
  id: string;
  /** O nome que a loja deu, para achá-la na lista. O cliente lê o rótulo, e não ele. */
  nome: string;
  tipo: TipoDePromocao;
  alvo: AlvoDaPromocao;
  produtoId: string | null;
  categoriaId: string | null;
  /** `PERCENTUAL` e `SEGUNDO_COM_DESCONTO`: de 1 a 100. */
  percentual: number | null;
  /** `PRECO`: o preço novo do produto. */
  precoPromocional: number | null;
  /** `LEVE_PAGUE`: leva `leve`, paga `pague`. */
  leve: number | null;
  pague: number | null;
}

/** A promoção como a loja a vê no painel. */
export interface PromocaoDaLoja extends PromocaoPublica {
  ativa: boolean;
  /** `null`: sem limite. Conta pedidos, e não unidades. */
  limiteDeUsos: number | null;
  /** Quantos pedidos já a usaram; o pedido cancelado devolve o uso. */
  usos: number;
  criadaEm: string;
  atualizadaEm: string;
}

/* ---------------------------------------------------------------------------
 * Cupons
 * ------------------------------------------------------------------------- */

/**
 * O cupom que o cliente digita no checkout. Só vale em item SEM promoção
 * automática, salvo o cupom que liga `valeEmPromocao`; nunca se soma à promoção
 * do mesmo item. A conta é a mesma na página e no servidor —
 * `store-coupon.rules.ts`, em `@motoboycity/validation`.
 *
 * - `PERCENTUAL`: "10% OFF", com teto opcional (`descontoMaximo`).
 * - `VALOR`: "R$ 5,00 de desconto", nunca mais que o que os itens alcançados custam.
 */
export type TipoDeCupom = 'PERCENTUAL' | 'VALOR';

/**
 * O que a página recebe DEPOIS de o cliente digitar o código — e só então: a
 * loja não publica a lista de cupons. É o suficiente para a página recalcular o
 * desconto a cada mudança da sacola, sem perguntar ao servidor de novo; o que só o
 * servidor sabe (usos, limite por cliente) ele confere na conferência e no pedido.
 */
export interface CupomPublico {
  /** Em maiúsculas, como a loja o cadastrou. */
  codigo: string;
  tipo: TipoDeCupom;
  /** `PERCENTUAL`: de 1 a 100. */
  percentual: number | null;
  /** `VALOR`: o desconto, em reais. */
  valor: number | null;
  /** Os itens da sacola, já com as promoções, precisam somar isto ao menos. */
  pedidoMinimo: number | null;
  /** `PERCENTUAL`: o desconto não passa disto. */
  descontoMaximo: number | null;
  /** Vale também nos itens que já têm promoção. Desligado de saída. */
  valeEmPromocao: boolean;
  /** Vazios os dois: vale em todos os itens. Senão, no produto OU na seção listados. */
  produtoIds: string[];
  categoriaIds: string[];
}

/** O cupom como a loja o vê no painel. */
export interface CupomDaLoja extends CupomPublico {
  id: string;
  ativo: boolean;
  /** Datas do calendário da loja, `AAAA-MM-DD`, as duas pontas incluídas. */
  inicio: string | null;
  fim: string | null;
  /** `null`: sem limite. Conta pedidos, e não unidades. */
  limiteDeUsos: number | null;
  /** `null`: sem limite. Conta pedidos do mesmo cliente. */
  limitePorCliente: number | null;
  /** Quantos pedidos já o usaram; o pedido cancelado devolve o uso. */
  usos: number;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * A resposta de "aplicar cupom" no checkout: o cupom (para a página recalcular)
 * e o desconto que ele dá à sacola que o cliente mandou.
 */
export interface ConferenciaDoCupom {
  cupom: CupomPublico;
  desconto: number;
}
