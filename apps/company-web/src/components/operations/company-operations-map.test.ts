import { describe, expect, it } from 'vitest';
import type { CompanyAddressItem, OperationalDeliveryItem } from '@motoboycity/types';
import { operationsMapCameraScope } from './company-operations-map';

const pickup = { lat: -20.151, lng: -41.622 } as CompanyAddressItem;

function delivery(input: {
  id: string;
  dropoffLat: number;
  dropoffLng: number;
  driverLat?: number;
  driverLng?: number;
}) {
  return {
    id: input.id,
    addresses: [
      {
        type: 'DROPOFF',
        lat: input.dropoffLat,
        lng: input.dropoffLng,
      },
    ],
    lastLocation:
      input.driverLat !== undefined && input.driverLng !== undefined
        ? { lat: input.driverLat, lng: input.driverLng }
        : null,
  } as OperationalDeliveryItem;
}

describe('operationsMapCameraScope', () => {
  it('nao reenquadra o mapa quando somente a posicao GPS do motoboy muda', () => {
    const before = operationsMapCameraScope(pickup, [
      delivery({
        id: 'delivery-1',
        dropoffLat: -20.155,
        dropoffLng: -41.625,
        driverLat: -20.152,
        driverLng: -41.623,
      }),
    ]);
    const after = operationsMapCameraScope(pickup, [
      delivery({
        id: 'delivery-1',
        dropoffLat: -20.155,
        dropoffLng: -41.625,
        driverLat: -20.154,
        driverLng: -41.624,
      }),
    ]);

    expect(after).toBe(before);
  });

  it('reenquadra quando entra um pedido ou o destino muda', () => {
    const original = delivery({
      id: 'delivery-1',
      dropoffLat: -20.155,
      dropoffLng: -41.625,
    });
    const changedDestination = delivery({
      id: 'delivery-1',
      dropoffLat: -20.16,
      dropoffLng: -41.63,
    });
    const secondDelivery = delivery({
      id: 'delivery-2',
      dropoffLat: -20.17,
      dropoffLng: -41.64,
    });

    expect(operationsMapCameraScope(pickup, [changedDestination])).not.toBe(
      operationsMapCameraScope(pickup, [original]),
    );
    expect(operationsMapCameraScope(pickup, [original, secondDelivery])).not.toBe(
      operationsMapCameraScope(pickup, [original]),
    );
  });

  it('nao reenquadra apenas porque a ordem da lista mudou', () => {
    const first = delivery({ id: 'delivery-1', dropoffLat: -20.155, dropoffLng: -41.625 });
    const second = delivery({ id: 'delivery-2', dropoffLat: -20.16, dropoffLng: -41.63 });

    expect(operationsMapCameraScope(pickup, [second, first])).toBe(
      operationsMapCameraScope(pickup, [first, second]),
    );
  });
});
