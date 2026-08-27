import { getActiveDeliveries, type ActiveDeliveryItem } from './activeDeliveries';

export type ReconciledAssignment = {
  delivery: ActiveDeliveryItem;
  activeDeliveries: ActiveDeliveryItem[];
};

/**
 * Confirma no estado persistido se um aceite/claim sem resposta já foi
 * aplicado. Falha de rede continua sendo propagada: `null` significa apenas
 * que a consulta respondeu e o pedido não pertence ao motoboy.
 */
export async function reconcileAcceptedAssignment(
  accessToken: string,
  candidateDeliveryIds: readonly string[],
): Promise<ReconciledAssignment | null> {
  const candidateIds = new Set(candidateDeliveryIds);
  const activeDeliveries = await getActiveDeliveries(accessToken);
  const delivery = activeDeliveries.find((item) => candidateIds.has(item.id));
  return delivery ? { delivery, activeDeliveries } : null;
}
