import type { DeliveryListItem, DeliveryStatus } from '@motoboycity/types';
import { deliveriesApi } from './apiClient';

/**
 * `FAILED` ainda e operacional: a mercadoria continua com o motoboy ate ele
 * confirmar que voltou a loja. Omiti-lo faz a devolucao desaparecer
 * da Home e interrompe o rastreamento depois de reabrir o aplicativo.
 */
export const operationalStatuses: DeliveryStatus[] = [
  'ACCEPTED',
  'COLLECTED',
  'DELIVERED',
  'FAILED',
];

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

/**
 * Detecta o aceite concluido fora do React Native (botoes da notificacao ou
 * tela cheia Android), para a Home abrir a operacao quando volta ao primeiro
 * plano. Entregas antigas nao provocam navegacao repetida.
 */
export function findNewlyAcceptedDelivery(
  deliveries: ReadonlyArray<DeliveryListItem>,
  knownDeliveryIds: ReadonlySet<string>,
): DeliveryListItem | undefined {
  return deliveries.find(
    (delivery) => delivery.status === 'ACCEPTED' && !knownDeliveryIds.has(delivery.id),
  );
}
