import type { DeliveryListItem } from '@motoboycity/types';

/**
 * O dinheiro que o motoboy informou para devolver à loja, na entrega com
 * retorno (pedido do cliente em 19/10/2026).
 *
 * Recebe o formatador de `useMoney()` em vez de formatar aqui: é ele que aplica
 * a máscara `R$ ••••` quando o dono esconde os valores, e um segundo formatador
 * furaria a máscara em silêncio.
 *
 * `null` quando não há o que mostrar: pedido sem retorno, ainda não entregue,
 * ou concluído antes de o aplicativo perguntar.
 */
export function dinheiroADevolver(
  delivery: Pick<DeliveryListItem, 'requiresReturn' | 'cashToReturn' | 'status'>,
  money: (valor: number) => string,
): string | null {
  if (!delivery.requiresReturn) return null;
  if (delivery.cashToReturn === null) {
    return delivery.status === 'DELIVERED' ? 'Não informado pelo motoboy' : null;
  }
  if (delivery.cashToReturn === 0) return 'Motoboy não recebeu dinheiro';
  return `${money(delivery.cashToReturn)} em dinheiro`;
}
