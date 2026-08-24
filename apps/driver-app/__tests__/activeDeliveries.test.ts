import { deliveriesApi } from '../src/lib/apiClient';
import type { DeliveryListItem } from '@motoboycity/types';
import {
  findNewlyAcceptedDelivery,
  getActiveDeliveries,
  operationalStatuses,
} from '../src/lib/activeDeliveries';

jest.mock('../src/lib/apiClient', () => ({
  deliveriesApi: { list: jest.fn(() => Promise.resolve([])) },
}));

describe('recuperação das entregas operacionais', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mantém FAILED ativo até a devolução da mercadoria ser concluída', async () => {
    await expect(getActiveDeliveries('token-1')).resolves.toEqual([]);

    expect(operationalStatuses).toEqual(['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED']);
    expect(deliveriesApi.list).toHaveBeenCalledTimes(4);
    expect(deliveriesApi.list).toHaveBeenCalledWith('token-1', { status: 'FAILED' });
  });

  it('detecta somente o aceite novo feito pela interface nativa', () => {
    const deliveries = [
      { id: 'em-entrega', status: 'COLLECTED' },
      { id: 'aceite-antigo', status: 'ACCEPTED' },
      { id: 'aceite-novo', status: 'ACCEPTED' },
    ] as DeliveryListItem[];

    expect(findNewlyAcceptedDelivery(deliveries, new Set(['aceite-antigo']))?.id).toBe(
      'aceite-novo',
    );
    expect(
      findNewlyAcceptedDelivery(deliveries, new Set(deliveries.map((delivery) => delivery.id))),
    ).toBeUndefined();
  });
});
