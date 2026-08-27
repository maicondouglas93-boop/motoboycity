import type { DeliveryAddressItem } from '@motoboycity/types';
import {
  activeDeliveryStops,
  pickupCountdownLabel,
} from '../src/lib/activeDeliveryPresentation';
import type { ActiveDeliveryItem } from '../src/lib/activeDeliveries';

const pickup: DeliveryAddressItem = {
  type: 'PICKUP',
  street: 'Rua da Loja',
  number: '10',
  complement: null,
  city: 'Lajinha',
  state: 'MG',
  zip: '36980-000',
  lat: null,
  lng: null,
  referenceNote: null,
};

const dropoff: DeliveryAddressItem = {
  ...pickup,
  type: 'DROPOFF',
  street: 'Rua do Cliente',
  number: '20',
};

function delivery(overrides: Partial<ActiveDeliveryItem> = {}): ActiveDeliveryItem {
  return {
    status: 'ACCEPTED',
    destinationKnownAtCreation: true,
    requiresReturn: false,
    addresses: [pickup, dropoff],
    ...overrides,
  } as ActiveDeliveryItem;
}

describe('rota compacta do pedido ativo', () => {
  it('mostra apenas coleta e entrega quando não existe retorno', () => {
    expect(activeDeliveryStops(delivery())).toEqual([
      expect.objectContaining({
        icon: 'house',
        done: true,
        address: expect.stringContaining('Rua da Loja'),
      }),
      expect.objectContaining({
        icon: 'pin',
        done: false,
        address: expect.stringContaining('Rua do Cliente'),
      }),
    ]);
  });

  it('marca coleta no aceite e marca tambem o destino depois da entrega', () => {
    const accepted = activeDeliveryStops(delivery({ status: 'ACCEPTED' }));
    const delivered = activeDeliveryStops(delivery({ status: 'DELIVERED' }));

    expect(accepted.map((stop) => stop.done)).toEqual([true, false]);
    expect(delivered.map((stop) => stop.done)).toEqual([true, true]);
  });

  it('nao marca o destino de uma entrega que falhou', () => {
    const failed = activeDeliveryStops(delivery({ status: 'FAILED' }));

    expect(failed[0]?.done).toBe(true);
    expect(failed[1]?.done).toBe(false);
  });

  it('adiciona o círculo de retorno por último somente quando há retorno', () => {
    const stops = activeDeliveryStops(delivery({ requiresReturn: true }));

    expect(stops).toHaveLength(3);
    expect(stops[2]).toEqual(
      expect.objectContaining({ icon: 'return', address: expect.stringContaining('Rua da Loja') }),
    );
  });

  it('explica quando o endereço será definido no momento da entrega', () => {
    expect(
      activeDeliveryStops(delivery({ destinationKnownAtCreation: false, addresses: [pickup] }))[1],
    ).toEqual(
      expect.objectContaining({
        icon: 'pin',
        address: 'Endereço de entrega definido no momento da entrega',
      }),
    );
  });
});

describe('contagem regressiva da coleta', () => {
  const now = Date.parse('2026-08-27T18:00:00.000Z');

  it('conta de forma decrescente e nunca mostra valor negativo', () => {
    const accepted = delivery({
      pickupDeadlineAt: '2026-08-27T18:21:22.000Z',
    });

    expect(pickupCountdownLabel(accepted, now)).toBe('21:22');
    expect(pickupCountdownLabel(accepted, now + 1_000)).toBe('21:21');
    expect(pickupCountdownLabel(accepted, now + 2_000_000)).toBe('00:00');
  });

  it('some depois da coleta ou quando a regra nao esta configurada', () => {
    expect(pickupCountdownLabel(delivery({ status: 'COLLECTED' }), now)).toBeUndefined();
    expect(pickupCountdownLabel(delivery({ pickupDeadlineAt: null }), now)).toBeUndefined();
  });
});
