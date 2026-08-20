import type { User } from '@prisma/client';
import { DeliveryTrackingService } from './delivery-tracking.service';

describe('DeliveryTrackingService', () => {
  const point = {
    id: 'point-1',
    lat: { toString: () => '-19.9201000' },
    lng: { toString: () => '-43.9386000' },
    accuracy: { toString: () => '8.25' },
    capturedAt: new Date('2026-08-20T12:00:00.000Z'),
  };
  const tx = {
    deliveryLocationPoint: { create: jest.fn() },
    driver: { update: jest.fn() },
  };
  const prisma = {
    driver: { findUnique: jest.fn(), update: jest.fn() },
    delivery: { findUnique: jest.fn(), findMany: jest.fn() },
    deliveryLocationPoint: { findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
    companyTeamMember: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const realtimeGateway = { emitDeliveryLocation: jest.fn() };
  const service = new DeliveryTrackingService(prisma as never, realtimeGateway as never);
  const driverUser = { id: 'user-driver', type: 'DRIVER' } as User;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.deliveryLocationPoint.create.mockResolvedValue(point);
    tx.driver.update.mockResolvedValue({ id: 'driver-1' });
  });

  it('registra ponto apenas da entrega ativa atribuída ao motoboy e emite atualização', async () => {
    prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'delivery-1',
      driverId: 'driver-1',
      companyId: 'company-1',
      status: 'COLLECTED',
    });

    await expect(
      service.report(driverUser, 'delivery-1', { lat: -19.9201, lng: -43.9386, accuracy: 8.25 }),
    ).resolves.toEqual({
      id: 'point-1',
      lat: -19.9201,
      lng: -43.9386,
      accuracy: 8.25,
      capturedAt: '2026-08-20T12:00:00.000Z',
    });

    expect(tx.deliveryLocationPoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryId: 'delivery-1', driverId: 'driver-1' }),
      }),
    );
    expect(realtimeGateway.emitDeliveryLocation).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ deliveryId: 'delivery-1', driverId: 'driver-1' }),
    );
  });

  it('não lista entrega de outra empresa para membro de empresa', async () => {
    prisma.companyTeamMember.findMany.mockResolvedValue([{ companyId: 'company-allowed' }]);
    prisma.delivery.findMany.mockResolvedValue([]);

    await expect(
      service.active({ id: 'company-user', type: 'COMPANY_MEMBER' } as User),
    ).resolves.toEqual([]);

    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: { in: ['company-allowed'] } }),
      }),
    );
  });

  it('remove somente pontos anteriores à janela de retenção de 30 dias', async () => {
    prisma.deliveryLocationPoint.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-08-31T15:00:00.000Z');

    await expect(service.purgeExpiredPoints(now)).resolves.toBe(3);

    expect(prisma.deliveryLocationPoint.deleteMany).toHaveBeenCalledWith({
      where: { capturedAt: { lt: new Date('2026-08-01T15:00:00.000Z') } },
    });
  });
});
