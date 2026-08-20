import type { DeliveryListItem, DeliveryStatus } from '@motoboycity/types';
import { deliveriesApi } from './apiClient';

const operationalStatuses: DeliveryStatus[] = ['ACCEPTED', 'COLLECTED', 'DELIVERED'];

/**
 * A API aplica o escopo do motoboy autenticado no servidor. Consultar cada
 * status explicitamente tambem evita que pedidos encerrados aparecam como
 * trabalho ativo quando o aplicativo e reaberto.
 */
export async function getActiveDeliveries(accessToken: string): Promise<DeliveryListItem[]> {
  const groups = await Promise.all(
    operationalStatuses.map((status) => deliveriesApi.list(accessToken, { status })),
  );

  return groups.flat().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
