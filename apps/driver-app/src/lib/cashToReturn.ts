import type { DeliveryListItem } from '@motoboycity/types';
import { MAX_DINHEIRO_A_DEVOLVER } from '@motoboycity/validation';
import type { PendingDeliveryCompletion } from './deliveryCompletionOutbox';
import { formatarDinheiro } from './format';
import { parseWithdrawalAmount } from './withdrawal';

/**
 * O dinheiro que o motoboy recebeu do cliente e vai devolver à loja.
 *
 * Pedido do cliente em 19/10/2026: na entrega com retorno, ao marcar entregue,
 * ele informa quanto vai devolver — "pra segurança que ele vai lembrar de
 * devolver o dinheiro". É dinheiro do cliente, não da corrida: aparece até para
 * o motoboy de salário fixo, que não vê valores de entrega.
 */
export type DinheiroADevolver = {
  /** O que ele digitou, como digitou: "85,50". */
  texto: string;
  /** Tocou em "Não recebi dinheiro" (cartão, Pix ou já pago). */
  semDinheiro: boolean;
};

export const DINHEIRO_EM_BRANCO: DinheiroADevolver = { texto: '', semDinheiro: false };

/**
 * O campo ao reabrir o modal de uma entrega que já está na fila do aparelho:
 * com o que ele informou, para não precisar digitar de novo.
 */
export function dinheiroJaInformado(cashToReturn: number | undefined): DinheiroADevolver {
  if (cashToReturn === undefined) return DINHEIRO_EM_BRANCO;
  if (cashToReturn === 0) return { texto: '', semDinheiro: true };
  return { texto: cashToReturn.toFixed(2).replace('.', ','), semDinheiro: false };
}

/** "85", "85,5", "85,50", "1.234,56", "R$ 85,50" em reais; `null` se não for um valor. */
export function lerReais(texto: string): number | null {
  const semMoeda = texto.replace(/R\$/gi, '').trim();
  if (!/^[\d.,\s]+$/.test(semMoeda)) return null;
  const valor = parseWithdrawalAmount(semMoeda);
  if (!Number.isFinite(valor) || valor < 0) return null;
  // Fração de centavo não é dinheiro que se conte no caixa.
  if (Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6) return null;
  return Math.round(valor * 100) / 100;
}

export type ConferenciaDoDinheiro =
  { pronto: true; valor: number } | { pronto: false; aviso: string | null };

/**
 * Se dá para confirmar a entrega com o que ele preencheu, e com qual valor.
 *
 * Campo vazio não é "zero": quem não recebeu dinheiro diz isso com um toque,
 * para a loja nunca ler "R$ 0,00" de alguém que só pulou a pergunta.
 */
export function conferirDinheiro(dinheiro: DinheiroADevolver): ConferenciaDoDinheiro {
  if (dinheiro.semDinheiro) return { pronto: true, valor: 0 };
  if (dinheiro.texto.trim() === '') return { pronto: false, aviso: null };
  const valor = lerReais(dinheiro.texto);
  if (valor === null) return { pronto: false, aviso: 'Digite só o valor, como 85,50.' };
  if (valor === 0) {
    return { pronto: false, aviso: 'Se não recebeu dinheiro, toque em "Não recebi dinheiro".' };
  }
  if (valor > MAX_DINHEIRO_A_DEVOLVER) {
    return { pronto: false, aviso: 'Confira o valor: está alto demais para uma entrega.' };
  }
  return { pronto: true, valor };
}

/**
 * O lembrete até ele concluir o retorno.
 *
 * `null` quando não há o que lembrar: pedido sem retorno, ou entrega marcada
 * pelo aplicativo antigo ou pelo admin, que não perguntam.
 */
export function lembreteDoDinheiro(cashToReturn: number | null | undefined): string | null {
  if (cashToReturn === null || cashToReturn === undefined) return null;
  if (cashToReturn === 0) return 'Você informou que não recebeu dinheiro do cliente.';
  return `Devolva ${formatarDinheiro(cashToReturn)} em dinheiro à loja.`;
}

/**
 * O lembrete no card da Home, do toque em "entregue" até ele concluir o retorno.
 *
 * Sem internet o servidor ainda não sabe da entrega: o valor vem da fila do
 * aparelho, que é onde ele está guardado até sincronizar.
 */
export function lembreteNaLista(
  delivery: Pick<DeliveryListItem, 'id' | 'status' | 'requiresReturn' | 'cashToReturn'>,
  fila: ReadonlyArray<PendingDeliveryCompletion>,
): string | null {
  if (!delivery.requiresReturn) return null;
  const pendente = fila.find(
    (item) => item.deliveryId === delivery.id && item.action === 'DELIVER',
  );
  if (delivery.status !== 'DELIVERED' && !pendente) return null;
  const naFila = pendente?.action === 'DELIVER' ? pendente.payload.cashToReturn : undefined;
  return lembreteDoDinheiro(delivery.cashToReturn ?? naFila);
}

/**
 * O reparo de GPS troca a posição de uma entrega pendente — e só a posição.
 *
 * As duas formas de reparar montavam o pacote novo apenas com a coordenada; o
 * dinheiro declarado sumia, e a loja leria "não informado" de quem informou.
 * Se o pacote novo já traz o valor — ele confirmou de novo no modal —, vale o
 * novo.
 */
export function comPosicaoNova<P extends object, Q extends object>(anterior: P, novo: Q): Q {
  if (typeof (novo as { cashToReturn?: unknown }).cashToReturn === 'number') return novo;
  const dinheiro = (anterior as { cashToReturn?: unknown }).cashToReturn;
  return typeof dinheiro === 'number' ? { ...novo, cashToReturn: dinheiro } : novo;
}
