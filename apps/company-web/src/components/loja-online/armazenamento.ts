'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { EnderecoDaEntrega } from '@/lib/loja-mock';
import type { ItemEscolhido } from './folha-do-produto';

/**
 * A sacola e os pedidos vivem no APARELHO do cliente, e não em conta.
 *
 * Pedir um açaí não deveria exigir criar login: cada etapa antes do pedido é
 * gente que desiste. Sem conta, o lugar onde a sacola sobrevive ao
 * recarregamento é o próprio navegador.
 *
 * Isso tem um limite que precisa ficar dito: trocar de aparelho, limpar os
 * dados do site ou abrir numa janela anônima faz tudo sumir. Nada aqui é a
 * fonte de verdade do pedido — quando houver backend, ela é a API.
 *
 * Lido com `useSyncExternalStore`, e não com `useEffect` que chama `setState`.
 * O `localStorage` É um sistema externo, que é exatamente o caso para o qual
 * esse primitivo existe: ele resolve o instantâneo do servidor, a hidratação e
 * a notificação de mudança sem a cascata de renderizações que o efeito causa.
 */

const chaveDaSacola = (slug: string) => `loja:${slug}:sacola`;
const chaveDosPedidos = (slug: string) => `loja:${slug}:pedidos`;

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
}

type Atualizacao = ItemEscolhido[] | ((atual: ItemEscolhido[]) => ItemEscolhido[]);

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

export function usePedidos(slug: string) {
  const chave = chaveDosPedidos(slug);
  return useSyncExternalStore(
    assinar,
    () => instantaneo<PedidoGuardado[]>(chave, VAZIO),
    () => VAZIO as PedidoGuardado[],
  );
}

/** Grava o pedido na frente da lista e esvazia a sacola. */
export function guardarPedido(slug: string, pedido: PedidoGuardado): void {
  const atuais = ler<PedidoGuardado[]>(chaveDosPedidos(slug), VAZIO);
  gravar(chaveDosPedidos(slug), [pedido, ...atuais].slice(0, 20));
  gravar(chaveDaSacola(slug), []);
}

/**
 * Número visível do pedido. No sistema de verdade quem numera é o servidor —
 * aqui é só para a tela de demonstração ter o que mostrar.
 */
export function proximoNumero(slug: string): number {
  const atuais = ler<PedidoGuardado[]>(chaveDosPedidos(slug), VAZIO);
  return atuais.reduce((maximo, pedido) => Math.max(maximo, pedido.numero), 1600) + 1;
}

/** O que a última compra deixou preenchido, para o checkout não pedir de novo. */
export function ultimoCliente(
  slug: string,
): Pick<PedidoGuardado, 'nome' | 'telefone' | 'entrega'> | null {
  const ultimo = ler<PedidoGuardado[]>(chaveDosPedidos(slug), VAZIO)[0];
  if (!ultimo) return null;
  return { nome: ultimo.nome, telefone: ultimo.telefone, entrega: ultimo.entrega };
}
