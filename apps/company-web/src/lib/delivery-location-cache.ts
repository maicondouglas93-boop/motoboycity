import type { DeliveryOperationsResult, DeliveryTrackingPoint } from '@motoboycity/types';

export type DeliveryLocationRealtimeEvent = DeliveryTrackingPoint & {
  deliveryId: string;
  driverId: string;
};

/**
 * Aplica uma coordenada recebida por Socket.IO ao cache operacional sem
 * requisitar novamente a API. Eventos incompletos e entregas que nao estao no
 * cache sao ignorados para evitar dados invalidos e renderizacoes desnecessarias.
 */
export function updateDeliveryLocationInOperations(
  current: DeliveryOperationsResult | undefined,
  point: DeliveryLocationRealtimeEvent | null | undefined,
): DeliveryOperationsResult | undefined {
  if (
    !current ||
    !point?.deliveryId ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    !point.capturedAt
  ) {
    return current;
  }

  let changed = false;
  const updateItems = (items: DeliveryOperationsResult['active']) => {
    if (!items.some((delivery) => delivery.id === point.deliveryId)) return items;
    changed = true;
    return items.map((delivery) =>
      delivery.id === point.deliveryId
        ? {
            ...delivery,
            lastLocation: point,
          }
        : delivery,
    );
  };

  const active = updateItems(current.active);
  const recent = updateItems(current.recent);

  return changed ? { ...current, active, recent } : current;
}
