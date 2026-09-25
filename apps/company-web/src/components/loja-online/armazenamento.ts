'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { EnderecoDaEntrega } from '@/lib/loja-mock';
import type { ItemEscolhido } from './folha-do-produto';

/**
 * Onde a loja guarda sacola, pedidos e endereço enquanto não há backend.
 *
 * A identidade de quem compra é do Clerk; o que essa pessoa comprou e para
 * onde, não. Fica aqui, no navegador, separado por conta — ver as chaves
 * abaixo, que não são todas iguais de propósito.
 *
 * Isso tem um limite que precisa ficar dito, e que a conta TORNA PIOR: quem
 * entra com login espera achar o endereço dele no celular e no computador. O
 * `localStorage` não atravessa aparelho nenhum. Enquanto não há backend, esta
 * é a melhor aproximação; na integração, o endereço vai para o banco, no mesmo
 * formato que `CompanyCustomerAddress` já usa.
 *
 * Nada aqui é a fonte de verdade do pedido — quando houver backend, ela é a
 * API.
 *
 * Lido com `useSyncExternalStore`, e não com `useEffect` que chama `setState`.
 * O `localStorage` É um sistema externo, que é exatamente o caso para o qual
 * esse primitivo existe: ele resolve o instantâneo do servidor, a hidratação e
 * a notificação de mudança sem a cascata de renderizações que o efeito causa.
 */

/**
 * A SACOLA é do aparelho, e não da conta.
 *
 * O cliente escolhe primeiro e só entra na hora de fechar. Se a sacola fosse
 * por conta, tudo o que ele montou antes de entrar sumiria no instante do
 * login — perdendo justamente o trabalho que o fez chegar até ali.
 */
const chaveDaSacola = (slug: string) => `loja:${slug}:sacola`;

/**
 * PEDIDOS e ENDEREÇO são da conta.
 *
 * Num celular emprestado, sem a conta na chave, quem entrasse depois veria os
 * pedidos e o endereço de quem usou antes — nome, telefone e onde a pessoa
 * mora. A conta na chave é o que separa uma coisa da outra.
 */
const chaveDosPedidos = (slug: string, usuarioId: string) => `loja:${slug}:${usuarioId}:pedidos`;
const chaveDoCliente = (slug: string, usuarioId: string) => `loja:${slug}:${usuarioId}:cliente`;

/** Referência estável: `useSyncExternalStore` compara por identidade. */
const VAZIO: never[] = [];

const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  // `storage` só dispara em OUTRAS abas. A loja aberta em duas abas no mesmo
  // celular é raro, mas quando acontece as duas continuam concordando.
  window.addEventListener('storage', ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener('storage', ouvinte);
  };
}

/**
 * Cache por chave, comparando o texto bruto.
 *
 * Sem ele, cada leitura devolveria um objeto novo, `useSyncExternalStore`
 * concluiria que mudou e renderizaria em laço infinito.
 */
const lembrado = new Map<string, { bruto: string | null; valor: unknown }>();

function instantaneo<T>(chave: string, padrao: T): T {
  let bruto: string | null = null;
  try {
    bruto = window.localStorage.getItem(chave);
  } catch {
    // Janela anônima ou dados do site bloqueados: a loja serve normalmente,
    // só não lembra de nada entre visitas.
    bruto = null;
  }

  const anterior = lembrado.get(chave);
  if (anterior && anterior.bruto === bruto) return anterior.valor as T;

  let valor: T;
  try {
    valor = bruto === null ? padrao : (JSON.parse(bruto) as T);
  } catch {
    valor = padrao;
  }
  lembrado.set(chave, { bruto, valor });
  return valor;
}

function gravar(chave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Armazenamento cheio ou bloqueado: ver o comentário acima.
  }
  avisar();
}

function ler<T>(chave: string, padrao: T): T {
  return instantaneo(chave, padrao);
}

const naoAssina = () => () => {};
const noCliente = () => true;
const noServidor = () => false;

/**
 * Se o React já hidratou. Serve para não piscar "sacola vazia" no instante em
 * que o servidor ainda não leu o aparelho — e para os campos do checkout só
 * montarem quando houver de onde preencher.
 */
export function useHidratado(): boolean {
  return useSyncExternalStore(naoAssina, noCliente, noServidor);
}

export interface PedidoGuardado {
  numero: number;
  /** ISO, para a tela poder calcular a previsão de entrega. */
  criadoEm: string;
  itens: ItemEscolhido[];
  subtotal: number;
  taxaDeEntrega: number;
  total: number;
  pagamento: string;
  /** Só quando o pagamento é em dinheiro. */
  trocoPara: number | null;
  nome: string;
  telefone: string;
  entrega: EnderecoDaEntrega;
  minutosDePreparo: number;
  observacao: string | null;
  retirarNaLoja: boolean;
}

type Atualizacao = ItemEscolhido[] | ((atual: ItemEscolhido[]) => ItemEscolhido[]);

/**
 * O que torna duas linhas da sacola "a mesma": produto, tamanho e escolhas.
 *
 * Serve de regra para somar e também de `key` estável nas listas animadas — a
 * posição no array não serve, porque muda quando uma linha acima sai, e a
 * animação de saída acabaria rodando na linha errada.
 */
export function assinaturaDoItem(item: ItemEscolhido): string {
  return `${item.produtoId}|${item.tamanho ?? ''}|${[...item.escolhas].sort().join(', ')}`;
}

/**
 * Soma a quantidade quando a configuração é a MESMA, em vez de acrescentar uma
 * linha igual à anterior.
 *
 * Duas linhas "Açaí · 300ml" na sacola parecem erro do site: o cliente não tem
 * como saber que uma veio de um toque e a outra de outro. Configuração
 * diferente — outro tamanho, outro adicional — continua sendo linha separada,
 * porque aí são coisas diferentes mesmo.
 */
export function juntarNaSacola(atual: ItemEscolhido[], novo: ItemEscolhido): ItemEscolhido[] {
  const igual = atual.findIndex((item) => assinaturaDoItem(item) === assinaturaDoItem(novo));
  if (igual === -1) return [...atual, novo];

  return atual.map((item, indice) =>
    indice === igual ? { ...item, quantidade: item.quantidade + novo.quantidade } : item,
  );
}

/**
 * Mais um, menos um. Chegando a zero, a linha sai da sacola.
 *
 * Um lugar só para essa regra porque agora há duas telas que ajustam
 * quantidade — a folha da sacola, no cardápio, e o checkout.
 */
export function ajustarQuantidade(
  atual: ItemEscolhido[],
  indice: number,
  passo: number,
): ItemEscolhido[] {
  return atual
    .map((item, i) =>
      i === indice ? { ...item, quantidade: Math.max(0, item.quantidade + passo) } : item,
    )
    .filter((item) => item.quantidade > 0);
}

export function useSacola(slug: string) {
  const chave = chaveDaSacola(slug);

  const itens = useSyncExternalStore(
    assinar,
    () => instantaneo<ItemEscolhido[]>(chave, VAZIO),
    () => VAZIO as ItemEscolhido[],
  );

  const setItens = useCallback(
    (atualizacao: Atualizacao) => {
      const atual = instantaneo<ItemEscolhido[]>(chave, VAZIO);
      gravar(chave, typeof atualizacao === 'function' ? atualizacao(atual) : atualizacao);
    },
    [chave],
  );

  return { itens, setItens };
}

/** Sem conta não há pedido para listar: a loja exige login para comprar. */
export function usePedidos(slug: string, usuarioId: string | null) {
  const chave = usuarioId === null ? null : chaveDosPedidos(slug, usuarioId);
  return useSyncExternalStore(
    assinar,
    () => (chave === null ? (VAZIO as PedidoGuardado[]) : instantaneo(chave, VAZIO)),
    () => VAZIO as PedidoGuardado[],
  );
}

export interface ClienteSalvo {
  nome: string;
  telefone: string;
  /** `null` para quem só retirou na loja até agora e nunca informou endereço. */
  entrega: EnderecoDaEntrega | null;
}

/** Grava o pedido, guarda o endereço na conta e esvazia a sacola. */
export function guardarPedido(slug: string, usuarioId: string, pedido: PedidoGuardado): void {
  const chave = chaveDosPedidos(slug, usuarioId);
  gravar(chave, [pedido, ...ler<PedidoGuardado[]>(chave, VAZIO)].slice(0, 20));

  // Guardado à parte, e não lido do último pedido: assim continua valendo se o
  // histórico for podado, e é o registro que vai para o banco na integração.
  //
  // Retirada não pergunta endereço, então não pode mexer no que está salvo. Uma
  // versão anterior gravava o endereço do formulário mesmo assim — vazio, para
  // quem nunca tinha entregado — e a conta passava a ter um "endereço salvo" em
  // branco. Retirada atualiza nome e telefone; o endereço continua o da última
  // entrega.
  const anterior = ler<ClienteSalvo | null>(chaveDoCliente(slug, usuarioId), null);
  const salvo: ClienteSalvo = {
    nome: pedido.nome,
    telefone: pedido.telefone,
    entrega: pedido.retirarNaLoja ? (anterior?.entrega ?? null) : pedido.entrega,
  };
  gravar(chaveDoCliente(slug, usuarioId), salvo);

  gravar(chaveDaSacola(slug), []);
}

/**
 * Número visível do pedido. No sistema de verdade quem numera é o servidor —
 * aqui é só para a tela de demonstração ter o que mostrar.
 */
export function proximoNumero(slug: string, usuarioId: string): number {
  const atuais = ler<PedidoGuardado[]>(chaveDosPedidos(slug, usuarioId), VAZIO);
  return atuais.reduce((maximo, pedido) => Math.max(maximo, pedido.numero), 1600) + 1;
}

/** O endereço que a conta já deixou salvo, para o checkout não pedir de novo. */
export function clienteSalvo(slug: string, usuarioId: string): ClienteSalvo | null {
  return ler<ClienteSalvo | null>(chaveDoCliente(slug, usuarioId), null);
}
