import type { DeliveryOperationsResult } from '@motoboycity/types';
import { describe, expect, it } from 'vitest';

import {
  updateDeliveryLocationInOperations,
  type DeliveryLocationRealtimeEvent,
} from '@/lib/delivery-location-cache';

const activeDelivery = {
  id: 'delivery-active',
  lastLocation: null,
} as DeliveryOperationsResult['active'][number];

const recentDelivery = {
  id: 'delivery-recent',
  lastLocation: null,
} as DeliveryOperationsResult['recent'][number];

function createOperations(): DeliveryOperationsResult {
  return {
    active: [activeDelivery],
    recent: [recentDelivery],
    counts: {},
  };
}

function createPoint(
  deliveryId: string,
  overrides: Partial<DeliveryLocationRealtimeEvent> = {},
): DeliveryLocationRealtimeEvent {
  return {
    id: 'location-1',
    deliveryId,
    driverId: 'driver-1',
    lat: -23.5505,
    lng: -46.6333,
    accuracy: 8,
    capturedAt: '2026-08-26T16:00:00.000Z',
    ...overrides,
  };
}

describe('updateDeliveryLocationInOperations', () => {
  it.each([
    ['ativa', 'delivery-active', 'active'],
    ['recente', 'delivery-recent', 'recent'],
  ] as const)('atualiza uma entrega %s no cache', (_label, deliveryId, collection) => {
    const current = createOperations();
    const point = createPoint(deliveryId);

    const result = updateDeliveryLocationInOperations(current, point);

    expect(result).not.toBe(current);
    expect(result?.[collection][0]?.lastLocation).toEqual(point);
  });

  it('ignora coordenadas invalidas', () => {
    const current = createOperations();
    const invalidPoint = createPoint('delivery-active', { lat: Number.NaN });

    expect(updateDeliveryLocationInOperations(current, invalidPoint)).toBe(current);
  });

  it('preserva o cache quando a entrega nao esta carregada', () => {
    const current = createOperations();

    expect(updateDeliveryLocationInOperations(current, createPoint('delivery-unknown'))).toBe(
      current,
    );
  });
});
