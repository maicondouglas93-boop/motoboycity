import { getActiveDeliveries } from '../src/lib/activeDeliveries';
import { reconcileAcceptedAssignment } from '../src/lib/acceptanceReconciliation';

jest.mock('../src/lib/activeDeliveries', () => ({
  getActiveDeliveries: jest.fn(),
}));

const mockedGetActiveDeliveries = getActiveDeliveries as jest.MockedFunction<
  typeof getActiveDeliveries
>;

describe('reconcileAcceptedAssignment', () => {
  it('reconhece no servidor o pedido aceito mesmo sem a resposta original', async () => {
    mockedGetActiveDeliveries.mockResolvedValue([
      { id: 'delivery-1', status: 'ACCEPTED', createdAt: '2026-08-24T12:00:00.000Z' },
      { id: 'delivery-2', status: 'COLLECTED', createdAt: '2026-08-24T12:01:00.000Z' },
    ] as never);

    await expect(reconcileAcceptedAssignment('token', ['delivery-2'])).resolves.toMatchObject({
      delivery: { id: 'delivery-2' },
      activeDeliveries: expect.arrayContaining([expect.objectContaining({ id: 'delivery-1' })]),
    });
  });

  it('retorna null somente quando a consulta respondeu sem atribuir o pedido', async () => {
    mockedGetActiveDeliveries.mockResolvedValue([]);

    await expect(reconcileAcceptedAssignment('token', ['delivery-1'])).resolves.toBeNull();
  });
});
