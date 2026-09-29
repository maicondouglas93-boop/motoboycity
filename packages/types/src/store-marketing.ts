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
