import { deliveriesApi } from '../src/lib/apiClient';
import type { DeliveryListItem } from '@motoboycity/types';
import {
  findNewlyAcceptedDelivery,
  getActiveDeliveries,
  operationalStatuses,
  sortActiveDeliveries,
} from '../src/lib/activeDeliveries';

jest.mock('../src/lib/apiClient', () => ({
  deliveriesApi: {
    list: jest.fn(() => Promise.resolve([])),
    detail: jest.fn(),
  },
}));

describe('recuperação das entregas operacionais', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mantém FAILED ativo até a devolução da mercadoria ser concluída', async () => {
    await expect(getActiveDeliveries('token-1')).resolves.toEqual([]);

    expect(operationalStatuses).toEqual(['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED']);
    expect(deliveriesApi.list).toHaveBeenCalledTimes(4);
    expect(deliveriesApi.list).toHaveBeenCalledWith('token-1', { status: 'FAILED' });
    expect(deliveriesApi.detail).not.toHaveBeenCalled();
  });

  it('carrega os endereços somente para os pedidos que estão ativos', async () => {
    jest.mocked(deliveriesApi.list).mockImplementation(async (_token, filters) =>
      filters?.status === 'ACCEPTED'
        ? ([{ id: 'delivery-1', status: 'ACCEPTED', createdAt: '2026-08-27T12:00:00Z' }] as never)
        : [],
    );
    jest.mocked(deliveriesApi.detail).mockResolvedValue({
      id: 'delivery-1',
      addresses: [{ type: 'PICKUP', street: 'Rua A' }],
    } as never);

    await expect(getActiveDeliveries('token-1')).resolves.toEqual([
      expect.objectContaining({ id: 'delivery-1', addresses: expect.any(Array) }),
    ]);
    expect(deliveriesApi.detail).toHaveBeenCalledWith('token-1', 'delivery-1');
  });

  it('mantém o resumo operacional quando o detalhe falha', async () => {
    jest.mocked(deliveriesApi.list).mockImplementation(async (_token, filters) =>
      filters?.status === 'COLLECTED'
        ? ([{ id: 'delivery-2', status: 'COLLECTED', createdAt: '2026-08-27T12:00:00Z' }] as never)
        : [],
    );
    jest.mocked(deliveriesApi.detail).mockRejectedValue(new Error('offline'));

    await expect(getActiveDeliveries('token-1')).resolves.toEqual([
      expect.objectContaining({ id: 'delivery-2', status: 'COLLECTED' }),
    ]);
  });

  it('mantem no topo quem foi aceito primeiro mesmo depois da coleta', async () => {
    jest.mocked(deliveriesApi.list).mockImplementation(async (_token, filters) => {
      if (filters?.status === 'ACCEPTED') {
        return [
          {
            id: 'aceito-depois',
            displayNumber: 20,
            status: 'ACCEPTED',
            statusChangedAt: '2026-08-27T14:00:00Z',
            createdAt: '2026-08-27T10:00:00Z',
          },
        ] as never;
      }
      if (filters?.status === 'COLLECTED') {
        return [
          {
            id: 'aceito-primeiro',
            displayNumber: 21,
            status: 'COLLECTED',
            statusChangedAt: '2026-08-27T15:00:00Z',
            createdAt: '2026-08-27T12:00:00Z',
          },
        ] as never;
      }
      return [];
    });
    jest.mocked(deliveriesApi.detail).mockImplementation(async (_token, deliveryId) =>
      deliveryId === 'aceito-primeiro'
        ? ({
            id: deliveryId,
            displayNumber: 21,
            status: 'COLLECTED',
            statusChangedAt: '2026-08-27T15:00:00Z',
            createdAt: '2026-08-27T12:00:00Z',
            statusHistory: [
              { toStatus: 'ACCEPTED', changedAt: '2026-08-27T13:00:00Z' },
              { toStatus: 'COLLECTED', changedAt: '2026-08-27T15:00:00Z' },
            ],
          } as never)
        : ({
            id: deliveryId,
            displayNumber: 20,
            status: 'ACCEPTED',
            statusChangedAt: '2026-08-27T14:00:00Z',
            createdAt: '2026-08-27T10:00:00Z',
            statusHistory: [
              { toStatus: 'ACCEPTED', changedAt: '2026-08-27T11:00:00Z' },
              { toStatus: 'AWAITING_DRIVER', changedAt: '2026-08-27T12:00:00Z' },
              { toStatus: 'ACCEPTED', changedAt: '2026-08-27T14:00:00Z' },
            ],
          } as never),
    );

    const result = await getActiveDeliveries('token-1');

    expect(result.map((delivery) => delivery.id)).toEqual([
      'aceito-primeiro',
      'aceito-depois',
    ]);
    expect(result[0]?.acceptedAt).toBe('2026-08-27T13:00:00Z');
    expect(result[1]?.acceptedAt).toBe('2026-08-27T14:00:00Z');
  });

  it('ordena novamente pela hora do ultimo aceite apos voltar para a fila', () => {
    const result = sortActiveDeliveries([
      {
        id: 'reaceito',
        displayNumber: 30,
        acceptedAt: '2026-08-27T15:00:00Z',
        createdAt: '2026-08-27T09:00:00Z',
      },
      {
        id: 'aceito-antes',
        displayNumber: 31,
        acceptedAt: '2026-08-27T14:00:00Z',
        createdAt: '2026-08-27T13:00:00Z',
      },
    ] as never);

    expect(result.map((delivery) => delivery.id)).toEqual(['aceito-antes', 'reaceito']);
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
