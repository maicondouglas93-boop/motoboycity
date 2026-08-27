import type { User } from '@prisma/client';
import { GoneException, NotFoundException } from '@nestjs/common';
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
    delivery: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    deliveryLocationPoint: { findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
    companyTeamMember: { findMany: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const realtimeGateway = {
    emitDeliveryLocation: jest.fn(),
    emitPublicDeliveryLocation: jest.fn(),
  };
  const publicTrackingTokens = {
    createIdentifier: jest.fn(),
    tokenFromIdentifier: jest.fn((identifier: string) => `${identifier}.signature`),
    identifierFromToken: jest.fn(),
  };
  const service = new DeliveryTrackingService(
    prisma as never,
    realtimeGateway as never,
    publicTrackingTokens as never,
  );
  const driverUser = { id: 'user-driver', type: 'DRIVER' } as User;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    tx.deliveryLocationPoint.create.mockResolvedValue(point);
    tx.driver.update.mockResolvedValue({ id: 'driver-1' });
    realtimeGateway.emitPublicDeliveryLocation.mockResolvedValue(undefined);
    publicTrackingTokens.createIdentifier.mockReturnValue('a'.repeat(43));
    publicTrackingTokens.identifierFromToken.mockReturnValue('a'.repeat(43));
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
    expect(realtimeGateway.emitPublicDeliveryLocation).toHaveBeenCalledWith('delivery-1', {
      lat: -19.9201,
      lng: -43.9386,
      capturedAt: '2026-08-20T12:00:00.000Z',
    });
  });

  it('reutiliza o mesmo token publico para a entrega da empresa', async () => {
    prisma.companyTeamMember.findMany.mockResolvedValue([{ companyId: 'company-1' }]);
    prisma.delivery.findFirst.mockResolvedValue({
      id: 'delivery-1',
      companyId: 'company-1',
      status: 'COLLECTED',
      publicTrackingTokenId: 'token-id',
      publicTrackingIssuedAt: new Date('2026-08-27T12:00:00.000Z'),
    });

    await expect(
      service.issuePublicLink({ id: 'company-user', type: 'COMPANY_MEMBER' } as User, 'delivery-1'),
    ).resolves.toEqual({
      token: 'token-id.signature',
      issuedAt: '2026-08-27T12:00:00.000Z',
    });

    expect(prisma.delivery.updateMany).not.toHaveBeenCalled();
  });

  it('cria o token uma unica vez com escrita condicional', async () => {
    prisma.companyTeamMember.findMany.mockResolvedValue([{ companyId: 'company-1' }]);
    prisma.delivery.findFirst.mockResolvedValue({
      id: 'delivery-1',
      companyId: 'company-1',
      status: 'AWAITING_DRIVER',
      publicTrackingTokenId: null,
      publicTrackingIssuedAt: null,
    });
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.issuePublicLink(
      { id: 'company-user', type: 'COMPANY_MEMBER' } as User,
      'delivery-1',
    );

    expect(result.token).toBe(`${'a'.repeat(43)}.signature`);
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'delivery-1',
          companyId: 'company-1',
          status: { in: ['SCHEDULED', 'AWAITING_DRIVER', 'ACCEPTED', 'COLLECTED'] },
        }),
      }),
    );
  });

  it('nao gera link para entrega de outra empresa', async () => {
    prisma.companyTeamMember.findMany.mockResolvedValue([{ companyId: 'company-allowed' }]);
    prisma.delivery.findFirst.mockResolvedValue(null);

    await expect(
      service.issuePublicLink({ id: 'company-user', type: 'COMPANY_MEMBER' } as User, 'delivery-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revoga o link somente para a entrega pertencente a empresa', async () => {
    prisma.companyTeamMember.findMany.mockResolvedValue([{ companyId: 'company-1' }]);
    prisma.delivery.findFirst.mockResolvedValue({
      id: 'delivery-1',
      companyId: 'company-1',
      status: 'ACCEPTED',
      publicTrackingTokenId: 'token-id',
      publicTrackingIssuedAt: new Date('2026-08-27T12:00:00.000Z'),
    });
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.revokePublicLink(
        { id: 'company-user', type: 'COMPANY_MEMBER' } as User,
        'delivery-1',
      ),
    ).resolves.toEqual({ revoked: true });

    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1', companyId: 'company-1' },
      data: { publicTrackingTokenId: null, publicTrackingIssuedAt: null },
    });
  });

  it('devolve somente status e localizacao no contrato publico ativo', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      status: 'COLLECTED',
      statusChangedAt: new Date('2026-08-27T12:05:00.000Z'),
      publicTrackingIssuedAt: new Date('2026-08-27T12:00:00.000Z'),
      trackingPoints: [point],
      recipientPhone: 'nao-deve-vazar',
    });

    await expect(service.publicDetail('public-token')).resolves.toEqual({
      status: 'IN_TRANSIT',
      updatedAt: '2026-08-27T12:05:00.000Z',
      location: {
        lat: -19.9201,
        lng: -43.9386,
        capturedAt: '2026-08-20T12:00:00.000Z',
      },
    });
  });

  it('nao expoe posicao antes de um entregador aceitar', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      status: 'AWAITING_DRIVER',
      statusChangedAt: new Date('2026-08-27T12:05:00.000Z'),
      publicTrackingIssuedAt: new Date('2026-08-27T12:00:00.000Z'),
      trackingPoints: [point],
    });

    await expect(service.publicDetail('public-token')).resolves.toMatchObject({
      status: 'WAITING_DRIVER',
      location: null,
    });
  });

  it.each(['DELIVERED', 'FAILED', 'COMPLETED', 'CANCELLED'])(
    'expira o link imediatamente no status %s',
    async (status) => {
      prisma.delivery.findUnique.mockResolvedValue({
        status,
        statusChangedAt: new Date('2026-08-27T12:05:00.000Z'),
        publicTrackingIssuedAt: new Date('2026-08-27T12:00:00.000Z'),
        trackingPoints: [point],
      });

      await expect(service.publicDetail('public-token')).rejects.toBeInstanceOf(GoneException);
    },
  );

  it('trata token com assinatura invalida como inexistente', async () => {
    publicTrackingTokens.identifierFromToken.mockReturnValue(null);

    await expect(service.publicDetail('token-adulterado')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.delivery.findUnique).not.toHaveBeenCalled();
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
