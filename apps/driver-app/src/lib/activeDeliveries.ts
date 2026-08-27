import type {
  DeliveryAddressItem,
  DeliveryDetail,
  DeliveryListItem,
  DeliveryStatus,
} from '@motoboycity/types';
import { deliveriesApi } from './apiClient';

export type ActiveDeliveryItem = DeliveryListItem & {
  /** Carregado pelo detalhe somente para os poucos pedidos em andamento. */
  addresses?: DeliveryAddressItem[];
  /** Ultimo aceite pelo fluxo de despacho; nao muda ao coletar ou entregar. */
  acceptedAt?: string;
};

const acceptedAtByDeliveryId = new Map<string, string>();

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

function acceptedAtFromHistory(delivery: DeliveryListItem | DeliveryDetail): string | undefined {
  if (!('statusHistory' in delivery)) {
    return delivery.status === 'ACCEPTED' ? delivery.statusChangedAt : undefined;
  }

  let acceptedAt: string | undefined;
  for (const entry of delivery.statusHistory) {
    if (entry.toStatus === 'ACCEPTED') acceptedAt = entry.changedAt;
  }
  return acceptedAt;
}

function orderTimestamp(delivery: ActiveDeliveryItem): number {
  const value = delivery.acceptedAt ?? delivery.createdAt;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

/** Primeiro pedido aceito fica no topo e conserva a posicao durante a rota. */
export function sortActiveDeliveries(
  deliveries: ReadonlyArray<ActiveDeliveryItem>,
): ActiveDeliveryItem[] {
  return [...deliveries].sort(
    (left, right) =>
      orderTimestamp(left) - orderTimestamp(right) ||
      left.displayNumber - right.displayNumber ||
      left.id.localeCompare(right.id),
  );
}

/**
 * A API aplica o escopo do motoboy autenticado no servidor. Consultar cada
 * status explicitamente tambem evita que pedidos encerrados aparecam como
 * trabalho ativo quando o aplicativo e reaberto.
 */
export async function getActiveDeliveries(accessToken: string): Promise<ActiveDeliveryItem[]> {
  const groups = await Promise.all(
    operationalStatuses.map((status) => deliveriesApi.list(accessToken, { status })),
  );

  const summaries = groups.flat();
  const activeIds = new Set(summaries.map((delivery) => delivery.id));
  for (const deliveryId of acceptedAtByDeliveryId.keys()) {
    if (!activeIds.has(deliveryId)) acceptedAtByDeliveryId.delete(deliveryId);
  }

  const enriched = await Promise.all(
    summaries.map(async (delivery) => {
      // A listagem e propositalmente leve e nao inclui enderecos. A Home
      // enriquece somente os 3-4 pedidos ativos; se este GET auxiliar falhar,
      // preserva o card resumido em vez de apagar a operacao da tela.
      const detail = await deliveriesApi.detail(accessToken, delivery.id).catch(() => null);
      const item = detail ?? delivery;
      const acceptedAt =
        acceptedAtFromHistory(item) ?? acceptedAtByDeliveryId.get(delivery.id);
      if (acceptedAt) acceptedAtByDeliveryId.set(delivery.id, acceptedAt);
      return { ...item, ...(acceptedAt ? { acceptedAt } : {}) };
    }),
  );

  return sortActiveDeliveries(enriched);
}

/**
 * Detecta o aceite concluido fora do React Native (botoes da notificacao ou
 * tela cheia Android), para a Home abrir a operacao quando volta ao primeiro
 * plano. Entregas antigas nao provocam navegacao repetida.
 */
export function findNewlyAcceptedDelivery(
  deliveries: ReadonlyArray<ActiveDeliveryItem>,
  knownDeliveryIds: ReadonlySet<string>,
): DeliveryListItem | undefined {
  return deliveries.find(
    (delivery) => delivery.status === 'ACCEPTED' && !knownDeliveryIds.has(delivery.id),
  );
}
