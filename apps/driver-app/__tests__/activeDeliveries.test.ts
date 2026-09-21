import { deliveriesApi } from '../src/lib/apiClient';
import type { DeliveryListItem } from '@motoboycity/types';
import {
  decideAcceptedDeliveryOpening,
  findNewlyAcceptedDelivery,
  preliminaryDeliveryDetail,
  preserveKnownAddresses,
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

  describe('abertura automatica do pedido recem-aceito', () => {
    const deliveries = [
      { id: 'em-entrega', status: 'COLLECTED' },
      { id: 'aceite-antigo', status: 'ACCEPTED' },
      { id: 'aceite-novo', status: 'ACCEPTED' },
    ] as DeliveryListItem[];

    const cenarioBase = {
      deliveries,
      knownDeliveryIds: new Set(['em-entrega', 'aceite-antigo']),
      knowsPreviousDeliveries: true,
      handledDeliveryIds: new Set<string>(),
      homeIsFocused: true,
    };

    it('abre o aceite novo quando o motoboy esta na Home', () => {
      expect(decideAcceptedDeliveryOpening(cenarioBase)).toEqual({
        delivery: expect.objectContaining({ id: 'aceite-novo' }),
        open: true,
      });
    });

    it('nao troca o pedido que o motoboy esta operando em outra tela', () => {
      const decisao = decideAcceptedDeliveryOpening({ ...cenarioBase, homeIsFocused: false });

      expect(decisao.open).toBe(false);
      // O pedido continua sendo devolvido para a Home marcar como tratado:
      // sem isso ele abriria sozinho na proxima volta ao primeiro plano.
      expect(decisao.delivery?.id).toBe('aceite-novo');
    });

    it('nao reabre o mesmo aceite a cada volta ao primeiro plano', () => {
      expect(
        decideAcceptedDeliveryOpening({
          ...cenarioBase,
          handledDeliveryIds: new Set(['aceite-novo']),
        }).open,
      ).toBe(false);
    });

    it('nao chama de novo um pedido aceito antes da primeira listagem da sessao', () => {
      expect(
        decideAcceptedDeliveryOpening({
          ...cenarioBase,
          knownDeliveryIds: new Set<string>(),
          knowsPreviousDeliveries: false,
        }),
      ).toEqual({ delivery: undefined, open: false });
    });
  });

  it('entrega a listagem antes dos detalhes, para a tela desenhar mais cedo', async () => {
    jest
      .mocked(deliveriesApi.list)
      .mockImplementation(async (_token, filters) =>
        filters?.status === 'ACCEPTED'
          ? ([{ id: 'delivery-1', status: 'ACCEPTED', createdAt: '2026-08-27T12:00:00Z' }] as never)
          : [],
      );
    jest.mocked(deliveriesApi.detail).mockResolvedValue({
      id: 'delivery-1',
      status: 'ACCEPTED',
      createdAt: '2026-08-27T12:00:00Z',
      statusHistory: [],
      addresses: [{ type: 'PICKUP', street: 'Rua da Loja' }],
    } as never);

    const parciais: string[][] = [];
    const final = await getActiveDeliveries('token-1', (deliveries) => {
      parciais.push(deliveries.map((delivery) => delivery.id));
      // O detalhe ainda nao foi buscado quando o parcial chega.
      expect(deliveriesApi.detail).not.toHaveBeenCalled();
    });

    expect(parciais).toEqual([['delivery-1']]);
    expect(final[0]?.addresses).toHaveLength(1);
  });

  describe('aplicacao da listagem parcial', () => {
    it('mantem o endereco que ja estava na tela quando o parcial vem sem ele', () => {
      const anterior = [
        { id: 'd1', status: 'COLLECTED', addresses: [{ type: 'PICKUP' }] },
      ] as never as Parameters<typeof preserveKnownAddresses>[0];
      const parcial = [{ id: 'd1', status: 'DELIVERED' }] as never as Parameters<
        typeof preserveKnownAddresses
      >[1];

      const resultado = preserveKnownAddresses(anterior, parcial);

      // O status novo vale; o endereco antigo sobrevive ate o detalhe chegar.
      expect(resultado[0]).toEqual(
        expect.objectContaining({ status: 'DELIVERED', addresses: [{ type: 'PICKUP' }] }),
      );
    });

    it('nao ressuscita pedido que saiu da lista', () => {
      const anterior = [{ id: 'd1' }, { id: 'd2' }] as never as Parameters<
        typeof preserveKnownAddresses
      >[0];
      const parcial = [{ id: 'd2' }] as never as Parameters<typeof preserveKnownAddresses>[1];

      expect(preserveKnownAddresses(anterior, parcial).map((item) => item.id)).toEqual(['d2']);
    });
  });

  describe('detalhe provisorio para abrir o pedido sem spinner', () => {
    it('aproveita o que a Home ja tem e zera so o que nao conhece', () => {
      const detalhe = preliminaryDeliveryDetail({
        id: 'd1',
        displayNumber: 44,
        companyName: 'Elite Pizzaria',
        status: 'COLLECTED',
        driverValue: 9.5,
        addresses: [{ type: 'DROPOFF' }],
      } as never);

      expect(detalhe).toEqual(
        expect.objectContaining({
          displayNumber: 44,
          companyName: 'Elite Pizzaria',
          status: 'COLLECTED',
          driverValue: 9.5,
          addresses: [{ type: 'DROPOFF' }],
        }),
      );
      // Historico vazio e o combinado: quem decide transicao usa o pedido
      // recarregado da API, nunca este objeto.
      expect(detalhe.statusHistory).toEqual([]);
      expect(detalhe.driver).toBeNull();
    });

    it('nao quebra quando o pedido em memoria ainda nao tem enderecos', () => {
      const detalhe = preliminaryDeliveryDetail({ id: 'd1', status: 'ACCEPTED' } as never);

      expect(detalhe.addresses).toEqual([]);
    });
  });
});
