import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { DISPATCH_QUEUE, DispatchService } from './dispatch.service';

describe('DispatchService', () => {
  let service: DispatchService;
  let prisma: {
    delivery: { findUnique: jest.Mock; findMany: jest.Mock };
    deliveryOffer: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    driverPresenceLog: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let platformSettingsService: { get: jest.Mock };
  let realtimeGateway: { emitToDriver: jest.Mock; emitAdminActivity: jest.Mock };
  let queue: { add: jest.Mock; remove: jest.Mock };
  let tx: { delivery: { update: jest.Mock }; deliveryStatusHistory: { create: jest.Mock } };

  beforeEach(async () => {
    tx = { delivery: { update: jest.fn() }, deliveryStatusHistory: { create: jest.fn() } };
    prisma = {
      delivery: { findUnique: jest.fn(), findMany: jest.fn() },
      deliveryOffer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      driverPresenceLog: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    platformSettingsService = { get: jest.fn() };
    realtimeGateway = { emitToDriver: jest.fn(), emitAdminActivity: jest.fn() };
    queue = { add: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: getQueueToken(DISPATCH_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get(DispatchService);
  });

  describe('assertConfigured', () => {
    it('não lança quando o timeout está configurado', async () => {
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });

      await expect(service.assertConfigured()).resolves.toBeUndefined();
    });

    it('lança ConflictException quando o timeout não está configurado', async () => {
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: null });

      await expect(service.assertConfigured()).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('scheduleActivation', () => {
    it('agenda o job com delay calculado a partir de scheduledAt', async () => {
      const scheduledAt = new Date(Date.now() + 60_000);

      await service.scheduleActivation('delivery-1', scheduledAt);

      expect(queue.add).toHaveBeenCalledWith(
        'activate-scheduled',
        { deliveryId: 'delivery-1' },
        expect.objectContaining({ jobId: 'activate-delivery-1' }),
      );
      const call = queue.add.mock.calls[0][2];
      expect(call.delay).toBeGreaterThan(0);
      expect(call.delay).toBeLessThanOrEqual(60_000);
    });

    it('usa delay 0 quando scheduledAt já passou', async () => {
      await service.scheduleActivation('delivery-1', new Date(Date.now() - 60_000));

      const call = queue.add.mock.calls[0][2];
      expect(call.delay).toBe(0);
    });
  });

  describe('dispatchDelivery', () => {
    it('não faz nada se o pedido não existe', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await service.dispatchDelivery('delivery-1');

      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('não faz nada se o pedido não está mais AWAITING_DRIVER', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'ACCEPTED' });

      await service.dispatchDelivery('delivery-1');

      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('não faz nada se já existe oferta pendente', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'AWAITING_DRIVER' });
      prisma.deliveryOffer.findFirst.mockResolvedValue({ id: 'offer-existing' });

      await service.dispatchDelivery('delivery-1');

      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('não faz nada (sem lançar) se o timeout não está configurado', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'AWAITING_DRIVER' });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: null });

      await expect(service.dispatchDelivery('delivery-1')).resolves.toBeUndefined();
      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('não faz nada se não há motoboy elegível (fila esgotada)', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'AWAITING_DRIVER' });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany.mockResolvedValue([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([]);

      await service.dispatchDelivery('delivery-1');

      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('cria a oferta pro motoboy disponível há mais tempo, agenda expiração e emite eventos', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        driverValue: { toString: () => '13.52' },
        distanceKm: { toString: () => '5.43' },
        requiresReturn: true,
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 90 });
      prisma.deliveryOffer.findMany
        .mockResolvedValueOnce([]) // ofertas já feitas pra esse pedido
        .mockResolvedValueOnce([]); // motoboys ocupados (busyOffers) dentro de findNextEligibleDriverId
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      prisma.deliveryOffer.create.mockResolvedValue({ id: 'offer-1', deliveryId: 'delivery-1', driverId: 'driver-1' });

      await service.dispatchDelivery('delivery-1');

      expect(prisma.deliveryOffer.create).toHaveBeenCalledWith({
        data: { deliveryId: 'delivery-1', driverId: 'driver-1', response: 'PENDING' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'offer-expire',
        { offerId: 'offer-1' },
        { delay: 90_000, jobId: 'expire-offer-1' },
      );
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith('driver-1', 'delivery:offer', {
        offerId: 'offer-1',
        deliveryId: 'delivery-1',
        displayNumber: 7,
        driverValue: 13.52,
        distanceKm: 5.43,
        requiresReturn: true,
        expiresInSeconds: 90,
      });
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalled();
    });

    it('exclui motoboys já ofertados pra esse pedido e motoboys ocupados com outra oferta pendente', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 1,
        driverValue: { toString: () => '10' },
        distanceKm: null,
        requiresReturn: false,
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany
        .mockResolvedValueOnce([{ driverId: 'driver-already-tried' }])
        .mockResolvedValueOnce([{ driverId: 'driver-busy' }]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-2' }]);
      prisma.deliveryOffer.create.mockResolvedValue({ id: 'offer-2' });

      await service.dispatchDelivery('delivery-1');

      expect(prisma.driverPresenceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driverId: { notIn: ['driver-already-tried', 'driver-busy'] },
          }),
        }),
      );
    });
  });

  describe('dispatchAvailableDeliveries', () => {
    it('tenta despachar cada pedido AWAITING_DRIVER em ordem de criação', async () => {
      prisma.delivery.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
      prisma.delivery.findUnique.mockResolvedValue(null); // curto-circuita dispatchDelivery, só queremos ver que foi chamado 2x

      await service.dispatchAvailableDeliveries();

      expect(prisma.delivery.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleOfferExpired', () => {
    it('não faz nada se a oferta não existe mais', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue(null);

      await service.handleOfferExpired('offer-1');

      expect(prisma.deliveryOffer.update).not.toHaveBeenCalled();
    });

    it('não faz nada se a oferta já foi respondida (não está mais PENDING)', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({ id: 'offer-1', response: 'ACCEPTED' });

      await service.handleOfferExpired('offer-1');

      expect(prisma.deliveryOffer.update).not.toHaveBeenCalled();
    });

    it('marca EXPIRED, notifica e tenta despachar o próximo motoboy', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        response: 'PENDING',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.delivery.findUnique.mockResolvedValue(null); // pro dispatchDelivery interno, curto-circuita

      await service.handleOfferExpired('offer-1');

      expect(prisma.deliveryOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: { response: 'EXPIRED', respondedAt: expect.any(Date) },
      });
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith('driver-1', 'delivery:offer-expired', {
        offerId: 'offer-1',
      });
      expect(prisma.delivery.findUnique).toHaveBeenCalledWith({ where: { id: 'delivery-1' } });
    });
  });

  describe('handleScheduledActivation', () => {
    it('não faz nada se o pedido não existe mais', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await service.handleScheduledActivation('delivery-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('não faz nada se o pedido não está mais SCHEDULED (ex.: já foi cancelado)', async () => {
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'CANCELLED' });

      await service.handleScheduledActivation('delivery-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('ativa o pedido (SCHEDULED -> AWAITING_DRIVER) e tenta despachar', async () => {
      prisma.delivery.findUnique
        .mockResolvedValueOnce({ id: 'delivery-1', status: 'SCHEDULED', displayNumber: 3 })
        .mockResolvedValueOnce(null); // pro dispatchDelivery interno

      await service.handleScheduledActivation('delivery-1');

      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { status: 'AWAITING_DRIVER', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: { deliveryId: 'delivery-1', fromStatus: 'SCHEDULED', toStatus: 'AWAITING_DRIVER' },
      });
    });
  });

  describe('cancelOfferTimeout', () => {
    it('remove o job de expiração pelo jobId derivado da oferta', async () => {
      await service.cancelOfferTimeout('offer-1');

      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
    });
  });
});
