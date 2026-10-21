import type { DeliveryListItem } from '@motoboycity/types';
import { formatarDinheiro } from '@/lib/dinheiro';

/**
 * O dinheiro que o motoboy informou para devolver à loja, como a loja lê.
 *
 * Pedido do cliente em 19/10/2026: na entrega com retorno, o motoboy informa
 * ao marcar entregue quanto vai trazer de volta em dinheiro. A loja vê o valor
 * enquanto ele volta e confere quando ele chega.
 *
 * `null` quando não há o que mostrar: pedido sem retorno, ou ainda não
 * entregue. Pedido concluído antes de o aplicativo perguntar também fica de
 * fora — "não informado" em todo pedido antigo seria só ruído.
 */
export function dinheiroADevolver(
  delivery: Pick<DeliveryListItem, 'requiresReturn' | 'cashToReturn' | 'status'>,
): string | null {
  if (!delivery.requiresReturn) return null;
  if (delivery.cashToReturn === null) {
    return delivery.status === 'DELIVERED' ? 'Não informado pelo motoboy' : null;
  }
  if (delivery.cashToReturn === 0) return 'Motoboy não recebeu dinheiro';
  return `${formatarDinheiro(delivery.cashToReturn)} em dinheiro`;
}

/** A linha do card enquanto ele volta: só quando há dinheiro de verdade a trazer. */
export function lembreteDoRetorno(
  delivery: Pick<DeliveryListItem, 'requiresReturn' | 'cashToReturn' | 'status'>,
): string | null {
  if (delivery.status !== 'DELIVERED' || !delivery.requiresReturn) return null;
  if (delivery.cashToReturn === null || delivery.cashToReturn === 0) return null;
  return `Traz ${formatarDinheiro(delivery.cashToReturn)} em dinheiro`;
}
