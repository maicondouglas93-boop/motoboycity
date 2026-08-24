import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { PushService } from '../push/push.service';

const offerPickupAddress = {
  type: 'PICKUP',
  street: 'Rua da Loja',
  number: '100',
  complement: null,
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  referenceNote: 'Porta lateral',
};

const offerDropoffAddress = {
  type: 'DROPOFF',
  street: 'Rua do Cliente',
  number: '200',
  complement: null,
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  referenceNote: null,
};
import { DISPATCH_QUEUE, DispatchService } from './dispatch.service';

describe('DispatchService', () => {
  let service: DispatchService;
  let prisma: {
    delivery: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    deliveryOffer: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    driverPresenceLog: { findMany: jest.Mock };
    driver: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let platformSettingsService: { get: jest.Mock };
  let realtimeGateway: {
    emitToDriver: jest.Mock;
    emitAdminActivity: jest.Mock;
    emitDeliveryUpdated: jest.Mock;
  };
  let livePresence: { isLive: jest.Mock };
  let push: { sendToDriver: jest.Mock };
  let queue: { add: jest.Mock; remove: jest.Mock };
  let tx: {
    $queryRaw: jest.Mock;
    driver: { findFirst: jest.Mock };
    delivery: { update: jest.Mock; updateMany: jest.Mock; findUniqueOrThrow: jest.Mock };
    deliveryOffer: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock; createMany: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'delivery-1' }]),
      driver: { findFirst: jest.fn().mockResolvedValue({ id: 'driver-1' }) },
      delivery: { update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
      deliveryOffer: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      deliveryStatusHistory: { create: jest.fn(), createMany: jest.fn() },
    };
    prisma = {
      delivery: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      deliveryOffer: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      driverPresenceLog: { findMany: jest.fn() },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    /**
     * Padrao de producao: sem teto de entregas simultaneas e sem teto de lote.
     * Os testes que dependem de um valor especifico sobrescrevem com o proprio
     * `mockResolvedValue`.
     */
    platformSettingsService = {
      get: jest.fn().mockResolvedValue({
        dispatchOfferTimeoutSeconds: 60,
        maxConcurrentDeliveriesPerDriver: null,
        maxDeliveriesPerBatch: null,
      }),
    };
    realtimeGateway = {
      emitToDriver: jest.fn(),
      emitAdminActivity: jest.fn(),
      emitDeliveryUpdated: jest.fn(),
    };
    livePresence = { isLive: jest.fn().mockResolvedValue(true) };
    push = { sendToDriver: jest.fn().mockResolvedValue(1) };
    queue = { add: jest.fn(), remove: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: LiveDriverPresenceService, useValue: livePresence },
        { provide: PushService, useValue: push },
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
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        company: { regionId: 'region-1' },
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue({ id: 'offer-existing' });

      await service.dispatchDelivery('delivery-1');

      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('não faz nada (sem lançar) se o timeout não está configurado', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        company: { regionId: 'region-1' },
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: null });

      await expect(service.dispatchDelivery('delivery-1')).resolves.toBeUndefined();
      expect(prisma.deliveryOffer.create).not.toHaveBeenCalled();
    });

    it('não faz nada se não há motoboy elegível (fila esgotada)', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        company: { regionId: 'region-1' },
        serviceTypeId: 'service-1',
      });
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
        destinationKnownAtCreation: true,
        totalValue: { toString: () => '16.90' },
        driverValue: { toString: () => '13.52' },
        platformValue: { toString: () => '3.38' },
        distanceKm: { toString: () => '5.43' },
        requiresReturn: true,
        paymentMethod: 'BILLED',
        recipientName: 'Cliente protegido',
        recipientPhone: '33999990000',
        driverNote: 'Instrução disponível somente depois do aceite',
        company: { regionId: 'region-1', tradeName: 'Loja de teste' },
        serviceType: { name: 'Motofrete' },
        addresses: [offerPickupAddress, offerDropoffAddress],
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 90 });
      prisma.deliveryOffer.findMany
        .mockResolvedValueOnce([]) // ofertas já feitas pra esse pedido
        .mockResolvedValueOnce([]); // motoboys ocupados (busyOffers) dentro de findNextEligibleDriverId
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      tx.deliveryOffer.create.mockResolvedValue({
        id: 'offer-1',
        deliveryId: 'delivery-1',
        driverId: 'driver-1',
      });

      await service.dispatchDelivery('delivery-1');

      expect(tx.deliveryOffer.create).toHaveBeenCalledWith({
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
        companyName: 'Loja de teste',
        paymentMethod: 'BILLED',
        totalValue: 16.9,
        driverValue: 13.52,
        platformValue: 3.38,
        distanceKm: 5.43,
        requiresReturn: true,
        deliveries: [
          {
            deliveryId: 'delivery-1',
            displayNumber: 7,
            serviceTypeName: 'Motofrete',
            destinationKnownAtCreation: true,
            pickupAddress: {
              street: 'Rua da Loja',
              number: '100',
              complement: null,
              city: 'Lajinha',
              state: 'MG',
              zip: '36930000',
              referenceNote: 'Porta lateral',
            },
            dropoffAddress: {
              street: 'Rua do Cliente',
              number: '200',
              complement: null,
              city: 'Lajinha',
              state: 'MG',
              zip: '36930000',
              referenceNote: null,
            },
            totalValue: 16.9,
            driverValue: 13.52,
            platformValue: 3.38,
            distanceKm: 5.43,
            requiresReturn: true,
          },
        ],
        expiresInSeconds: 90,
      });
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalled();
      expect(push.sendToDriver).toHaveBeenCalledWith('driver-1', {
        kind: 'offer',
        title: 'Pedido disponível',
        body: 'O pedido #7 está disponível.',
        data: {
          type: 'offer',
          offerId: 'offer-1',
          deliveryId: 'delivery-1',
          expiresInSeconds: '90',
          expiresAtEpochMs: expect.any(String),
        },
      });
      expect(prisma.driverPresenceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driver: {
              regionId: 'region-1',
              approvalStatus: 'APPROVED',
              accountStatus: 'ACTIVE',
              availability: 'AVAILABLE',
              // Sem filtro por entregas em andamento: o motoboy junta varias
              // entregas na mesma saida. O teto, quando existe, e aplicado por
              // contagem depois da consulta.
              AND: [
                {
                  serviceTypes: {
                    some: { serviceTypeId: 'service-1', serviceType: { active: true } },
                  },
                },
              ],
            },
          }),
        }),
      );
    });

    it('sem destino conhecido: emite driverValue/distanceKm null em vez de 0 (Number(null) seria 0)', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        destinationKnownAtCreation: false,
        totalValue: null,
        driverValue: null,
        platformValue: null,
        distanceKm: null,
        requiresReturn: false,
        paymentMethod: 'BILLED',
        company: { regionId: 'region-1', tradeName: 'Loja de teste' },
        serviceType: { name: 'Motofrete' },
        addresses: [offerPickupAddress],
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 90 });
      prisma.deliveryOffer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      tx.deliveryOffer.create.mockResolvedValue({
        id: 'offer-1',
        deliveryId: 'delivery-1',
        driverId: 'driver-1',
      });

      await service.dispatchDelivery('delivery-1');

      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'delivery:offer',
        expect.objectContaining({
          totalValue: null,
          driverValue: null,
          platformValue: null,
          distanceKm: null,
          deliveries: [
            expect.objectContaining({
              pickupAddress: expect.objectContaining({ street: 'Rua da Loja' }),
              dropoffAddress: null,
            }),
          ],
        }),
      );
    });

    it('exclui motoboys já ofertados pra esse pedido e motoboys ocupados com outra oferta pendente', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 1,
        destinationKnownAtCreation: true,
        totalValue: { toString: () => '12.50' },
        driverValue: { toString: () => '10' },
        platformValue: { toString: () => '2.50' },
        distanceKm: null,
        requiresReturn: false,
        paymentMethod: 'BILLED',
        company: { regionId: 'region-1', tradeName: 'Loja de teste' },
        serviceType: { name: 'Motofrete' },
        addresses: [offerPickupAddress, offerDropoffAddress],
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany
        .mockResolvedValueOnce([{ driverId: 'driver-already-tried' }])
        .mockResolvedValueOnce([{ driverId: 'driver-busy' }]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-2' }]);
      tx.deliveryOffer.create.mockResolvedValue({ id: 'offer-2' });

      await service.dispatchDelivery('delivery-1');

      expect(prisma.driverPresenceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driverId: { notIn: ['driver-already-tried', 'driver-busy'] },
          }),
        }),
      );
    });

    it('revalida o pedido sob lock e não cria oferta se o status mudou', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        driverValue: { toString: () => '10' },
        distanceKm: null,
        requiresReturn: false,
        company: { regionId: 'region-1' },
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      tx.$queryRaw.mockResolvedValue([]);

      await service.dispatchDelivery('delivery-1');

      expect(tx.deliveryOffer.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('trata a violação do índice único como corrida idempotente', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        driverValue: { toString: () => '10' },
        distanceKm: null,
        requiresReturn: false,
        company: { regionId: 'region-1' },
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      tx.deliveryOffer.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Oferta pendente já existe.', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      );

      await expect(service.dispatchDelivery('delivery-1')).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(queue.add).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
    });
  });

  describe('eligibility revalidation', () => {
    it('does not create an offer when the candidate becomes ineligible before commit', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        driverValue: { toString: () => '10' },
        distanceKm: null,
        requiresReturn: false,
        company: { regionId: 'region-1' },
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      tx.driver.findFirst.mockResolvedValue(null);

      await service.dispatchDelivery('delivery-1');

      expect(tx.driver.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'driver-1', regionId: 'region-1' }),
        select: { id: true },
      });
      expect(tx.deliveryOffer.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('batch dispatch', () => {
    it('oferta todas as entregas de um lote ao mesmo motoboy e emite um único evento agregado', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        batchId: 'batch-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        destinationKnownAtCreation: true,
        totalValue: { toString: () => '12' },
        driverValue: { toString: () => '10' },
        platformValue: { toString: () => '2' },
        distanceKm: { toString: () => '2' },
        requiresReturn: false,
        paymentMethod: 'BILLED',
        company: { regionId: 'region-1', tradeName: 'Loja de lote' },
        serviceType: { name: 'Motofrete' },
        addresses: [offerPickupAddress, offerDropoffAddress],
        serviceTypeId: 'service-1',
      });
      prisma.delivery.findMany.mockResolvedValue([
        {
          id: 'delivery-1',
          status: 'AWAITING_DRIVER',
          displayNumber: 7,
          destinationKnownAtCreation: true,
          totalValue: { toString: () => '12' },
          driverValue: { toString: () => '10' },
          platformValue: { toString: () => '2' },
          distanceKm: { toString: () => '2' },
          requiresReturn: false,
          serviceType: { name: 'Motofrete' },
          addresses: [offerPickupAddress, offerDropoffAddress],
          serviceTypeId: 'service-1',
        },
        {
          id: 'delivery-2',
          status: 'AWAITING_DRIVER',
          displayNumber: 8,
          destinationKnownAtCreation: true,
          totalValue: { toString: () => '15' },
          driverValue: { toString: () => '12' },
          platformValue: { toString: () => '3' },
          distanceKm: { toString: () => '3' },
          requiresReturn: true,
          serviceType: { name: 'Entrega expressa' },
          addresses: [offerPickupAddress, offerDropoffAddress],
          serviceTypeId: 'service-2',
        },
      ]);
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([{ driverId: 'driver-1' }]);
      tx.$queryRaw.mockResolvedValue([{ id: 'delivery-1' }, { id: 'delivery-2' }]);
      tx.deliveryOffer.create
        .mockResolvedValueOnce({ id: 'offer-1' })
        .mockResolvedValueOnce({ id: 'offer-2' });

      await service.dispatchDelivery('delivery-1');

      expect(tx.deliveryOffer.create).toHaveBeenCalledTimes(2);
      expect(tx.deliveryOffer.create).toHaveBeenNthCalledWith(1, {
        data: { deliveryId: 'delivery-1', driverId: 'driver-1', response: 'PENDING' },
      });
      expect(tx.deliveryOffer.create).toHaveBeenNthCalledWith(2, {
        data: { deliveryId: 'delivery-2', driverId: 'driver-1', response: 'PENDING' },
      });
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith('driver-1', 'delivery:offer', {
        offerId: 'offer-1',
        deliveryId: 'delivery-1',
        displayNumber: 7,
        companyName: 'Loja de lote',
        paymentMethod: 'BILLED',
        totalValue: 27,
        driverValue: 22,
        platformValue: 5,
        distanceKm: 5,
        requiresReturn: true,
        deliveries: [
          expect.objectContaining({
            deliveryId: 'delivery-1',
            serviceTypeName: 'Motofrete',
            pickupAddress: expect.objectContaining({ street: 'Rua da Loja' }),
            dropoffAddress: expect.objectContaining({ street: 'Rua do Cliente' }),
          }),
          expect.objectContaining({
            deliveryId: 'delivery-2',
            serviceTypeName: 'Entrega expressa',
            pickupAddress: expect.objectContaining({ street: 'Rua da Loja' }),
            dropoffAddress: expect.objectContaining({ street: 'Rua do Cliente' }),
          }),
        ],
        expiresInSeconds: 60,
        batchId: 'batch-1',
        deliveryCount: 2,
      });
      expect(prisma.driverPresenceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driver: expect.objectContaining({
              regionId: 'region-1',
              AND: [
                {
                  serviceTypes: {
                    some: { serviceTypeId: 'service-1', serviceType: { active: true } },
                  },
                },
                {
                  serviceTypes: {
                    some: { serviceTypeId: 'service-2', serviceType: { active: true } },
                  },
                },
              ],
            }),
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
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'delivery:offer-expired',
        {
          offerId: 'offer-1',
        },
      );
      expect(push.sendToDriver).toHaveBeenCalledWith(
        'driver-1',
        expect.objectContaining({
          kind: 'offer-update',
          data: expect.objectContaining({
            type: 'offer-resolved',
            offerId: 'offer-1',
            reason: 'expired',
          }),
        }),
      );
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

  describe('acceptOffer', () => {
    it('lança NotFoundException se a oferta não existe', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue(null);

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lança ForbiddenException se a oferta pertence a outro motoboy', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'outro-motoboy',
        deliveryId: 'delivery-1',
      });

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lança ConflictException e reverte tudo se a oferta já não está mais PENDING (corrida com expiração)', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(queue.remove).not.toHaveBeenCalled();
    });

    it('lança ConflictException se o pedido já não está mais AWAITING_DRIVER (corrida com cancelamento)', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
    });

    it('aceita com sucesso: atualiza oferta e pedido, grava histórico, cancela timeout e avisa admin', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({ id: 'delivery-1', displayNumber: 9 });

      const result = await service.acceptOffer('offer-1', 'driver-1', 'user-1');

      expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', response: 'PENDING' },
        data: { response: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'AWAITING_DRIVER' },
        data: { status: 'ACCEPTED', driverId: 'driver-1', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'AWAITING_DRIVER',
          toStatus: 'ACCEPTED',
          changedByUserId: 'user-1',
        },
      });
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(push.sendToDriver).toHaveBeenCalledWith(
        'driver-1',
        expect.objectContaining({
          kind: 'offer-update',
          data: expect.objectContaining({ offerId: 'offer-1', reason: 'accepted' }),
        }),
      );
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalledWith(expect.stringContaining('#9'));
      expect(result).toEqual({ deliveryId: 'delivery-1', displayNumber: 9 });
    });
  });

  describe('batch offer responses', () => {
    it('aceita todas as ofertas e entregas do lote em uma única transação', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', batchId: 'batch-1' });
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', displayNumber: 7 },
        { id: 'delivery-2', displayNumber: 8 },
      ]);
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }, { id: 'offer-2' }]);
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 2 });
      tx.delivery.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.acceptOffer('offer-1', 'driver-1', 'user-1');

      expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['offer-1', 'offer-2'] }, response: 'PENDING' },
        data: { response: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['delivery-1', 'delivery-2'] }, status: 'AWAITING_DRIVER' },
        data: { status: 'ACCEPTED', driverId: 'driver-1', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ deliveryId: 'delivery-1', changedByUserId: 'user-1' }),
          expect.objectContaining({ deliveryId: 'delivery-2', changedByUserId: 'user-1' }),
        ]),
      });
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-2');
      expect(result).toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 7,
        batchId: 'batch-1',
        deliveryIds: ['delivery-1', 'delivery-2'],
        displayNumbers: [7, 8],
      });
    });
  });

  describe('declineOffer', () => {
    it('lança NotFoundException se a oferta não existe', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue(null);

      await expect(service.declineOffer('offer-1', 'driver-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lança ForbiddenException se a oferta pertence a outro motoboy', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'outro-motoboy',
        deliveryId: 'delivery-1',
      });

      await expect(service.declineOffer('offer-1', 'driver-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lança ConflictException se a oferta já não está mais PENDING', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.deliveryOffer.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.declineOffer('offer-1', 'driver-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('recusa com sucesso: marca DECLINED, cancela timeout e tenta despachar o próximo', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      prisma.delivery.findUnique.mockResolvedValue(null); // curto-circuita o dispatchDelivery interno

      await service.declineOffer('offer-1', 'driver-1');

      expect(prisma.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', response: 'PENDING' },
        data: { response: 'DECLINED', respondedAt: expect.any(Date) },
      });
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(prisma.delivery.findUnique).toHaveBeenCalledWith({ where: { id: 'delivery-1' } });
    });
  });

  describe('cancelScheduledActivation', () => {
    it('remove o job de ativação pelo jobId derivado do pedido', async () => {
      await service.cancelScheduledActivation('delivery-1');

      expect(queue.remove).toHaveBeenCalledWith('activate-delivery-1');
    });
  });

  describe('cancelPendingOfferForDelivery', () => {
    it('não faz nada se não há oferta pendente pro pedido', async () => {
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);

      await service.cancelPendingOfferForDelivery('delivery-1');

      expect(prisma.deliveryOffer.update).not.toHaveBeenCalled();
      expect(queue.remove).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('marca a oferta pendente como EXPIRED, cancela o timeout e avisa o motoboy', async () => {
      prisma.deliveryOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });

      await service.cancelPendingOfferForDelivery('delivery-1');

      expect(prisma.deliveryOffer.update).toHaveBeenCalledWith({
        where: { id: 'offer-1' },
        data: { response: 'EXPIRED', respondedAt: expect.any(Date) },
      });
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(push.sendToDriver).toHaveBeenCalledWith(
        'driver-1',
        expect.objectContaining({
          kind: 'offer-update',
          data: expect.objectContaining({ offerId: 'offer-1', reason: 'cancelled' }),
        }),
      );
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'delivery:offer-cancelled',
        {
          offerId: 'offer-1',
        },
      );
    });
  });

  describe('vitrine de pedidos disponiveis', () => {
    const motoboy = {
      id: 'driver-1',
      regionId: 'region-1',
      serviceTypes: [{ serviceTypeId: 'st-1' }],
    };

    it('nao lista nada para motoboy sem modalidade cadastrada', async () => {
      prisma.driver.findUnique.mockResolvedValue({ ...motoboy, serviceTypes: [] });

      await expect(service.listAvailableForDriver('driver-1')).resolves.toEqual([]);
      expect(prisma.delivery.findMany).not.toHaveBeenCalled();
    });

    it('continua mostrando a vitrine para quem ja esta com uma corrida', async () => {
      // Sem teto configurado o motoboy junta varias entregas na mesma saida.
      // Antes a vitrine sumia na primeira corrida, o que o obrigava a voltar a
      // loja entre uma entrega e outra.
      prisma.driver.findUnique.mockResolvedValue(motoboy);
      prisma.delivery.count.mockResolvedValue(3);
      prisma.delivery.findMany.mockResolvedValue([]);
      prisma.deliveryOffer.findMany.mockResolvedValue([]);

      await expect(service.listAvailableForDriver('driver-1')).resolves.toEqual([]);
      expect(prisma.delivery.findMany).toHaveBeenCalled();
    });

    it('esconde a vitrine ao atingir o teto configurado', async () => {
      platformSettingsService.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: 60,
        maxConcurrentDeliveriesPerDriver: 2,
        maxDeliveriesPerBatch: null,
      });
      prisma.driver.findUnique.mockResolvedValue(motoboy);
      prisma.delivery.count.mockResolvedValue(2);

      await expect(service.listAvailableForDriver('driver-1')).resolves.toEqual([]);
      expect(prisma.delivery.findMany).not.toHaveBeenCalled();
    });

    it('ainda mostra a vitrine com o teto configurado e uma vaga sobrando', async () => {
      platformSettingsService.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: 60,
        maxConcurrentDeliveriesPerDriver: 2,
        maxDeliveriesPerBatch: null,
      });
      prisma.driver.findUnique.mockResolvedValue(motoboy);
      prisma.delivery.count.mockResolvedValue(1);
      prisma.delivery.findMany.mockResolvedValue([]);
      prisma.deliveryOffer.findMany.mockResolvedValue([]);

      await expect(service.listAvailableForDriver('driver-1')).resolves.toEqual([]);
      expect(prisma.delivery.findMany).toHaveBeenCalled();
    });

    it('filtra por regiao, modalidade e ausencia de oferta pendente', async () => {
      prisma.driver.findUnique.mockResolvedValue(motoboy);
      prisma.delivery.findFirst.mockResolvedValue(null);
      prisma.delivery.findMany.mockResolvedValue([]);

      await service.listAvailableForDriver('driver-1');

      const where = prisma.delivery.findMany.mock.calls[0]?.[0]?.where;
      expect(where).toMatchObject({
        status: 'AWAITING_DRIVER',
        driverId: null,
        company: { regionId: 'region-1' },
        serviceTypeId: { in: ['st-1'] },
        // Se alguem esta com o pedido na mao agora, ele ainda nao esta livre.
        offers: { none: { response: 'PENDING' } },
      });
      // Mais antigo primeiro: quem espera ha mais tempo precisa mais.
      expect(prisma.delivery.findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ createdAt: 'asc' });
    });

    it('recusa assumir pedido que ja saiu de AWAITING_DRIVER', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'ACCEPTED',
        driverId: 'outro',
      });

      await expect(
        service.claimDelivery('delivery-1', 'driver-1', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa assumir pedido que esta oferecido a outro neste momento', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: null,
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue({ id: 'offer-1' });

      await expect(service.claimDelivery('delivery-1', 'driver-1', 'user-1')).rejects.toThrow(
        'oferecido a outro motoboy',
      );
    });

    it('quem chega em segundo recebe conflito, e nao um aceite silencioso', async () => {
      // A protecao e o `updateMany` condicional: zero linhas atualizadas
      // significa que outro motoboy passou na frente entre a leitura e a
      // escrita.
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: null,
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', status: 'AWAITING_DRIVER', driverId: null },
      ]);
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.claimDelivery('delivery-1', 'driver-1', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('assume o pedido e registra que veio da vitrine', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: null,
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 1234,
        companyId: 'company-1',
        status: 'ACCEPTED',
      });

      const result = await service.claimDelivery('delivery-1', 'driver-1', 'user-1');

      expect(result).toEqual({ deliveryId: 'delivery-1', displayNumber: 1234 });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['delivery-1'] }, status: 'AWAITING_DRIVER', driverId: null },
        data: { status: 'ACCEPTED', driverId: 'driver-1', statusChangedAt: expect.any(Date) },
      });
      const historico = tx.deliveryStatusHistory.create.mock.calls[0]?.[0]?.data;
      expect(historico.note).toContain('pedidos disponíveis');
      expect(historico.changedByUserId).toBe('user-1');
    });

    it('o lote e assumido inteiro ou nenhum', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: 'batch-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      // Um irmao ja foi levado por outro: o lote inteiro esta fora.
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', status: 'AWAITING_DRIVER', driverId: null },
        { id: 'delivery-2', status: 'ACCEPTED', driverId: 'outro' },
      ]);

      await expect(service.claimDelivery('delivery-1', 'driver-1', 'user-1')).rejects.toThrow(
        'lote',
      );
    });
  });

  describe('devolver a entrega a fila', () => {
    it('lanca NotFoundException se o pedido nao existe', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await expect(
        service.returnDeliveryToQueue('delivery-1', 'driver-1', 'moto quebrou', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lanca ForbiddenException se o pedido esta com outro motoboy', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'ACCEPTED',
        driverId: 'outro-motoboy',
        batchId: null,
      });

      await expect(
        service.returnDeliveryToQueue('delivery-1', 'driver-1', 'moto quebrou', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('depois de coletar nao devolve a fila — aponta o insucesso', async () => {
      // A mercadoria esta com o motoboy. Devolver o pedido a fila deixaria o
      // pacote orfao: outro assumiria uma entrega cuja carga esta com terceiro.
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'COLLECTED',
        driverId: 'driver-1',
        batchId: null,
      });

      await expect(
        service.returnDeliveryToQueue('delivery-1', 'driver-1', 'moto quebrou', 'user-1'),
      ).rejects.toThrow('insucesso');
    });

    it('devolve para AWAITING_DRIVER, solta o motoboy e grava o motivo', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'ACCEPTED',
        driverId: 'driver-1',
        batchId: null,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 1234,
        companyId: 'company-1',
        status: 'AWAITING_DRIVER',
      });

      const resultado = await service.returnDeliveryToQueue(
        'delivery-1',
        'driver-1',
        'moto quebrou no meio do caminho',
        'user-1',
      );

      expect(resultado).toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 1234,
        returnedCount: 1,
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['delivery-1'] }, driverId: 'driver-1', status: 'ACCEPTED' },
        data: {
          status: 'AWAITING_DRIVER',
          driverId: null,
          statusChangedAt: expect.any(Date),
        },
      });
      const historico = tx.deliveryStatusHistory.create.mock.calls[0]?.[0]?.data;
      expect(historico.fromStatus).toBe('ACCEPTED');
      expect(historico.toStatus).toBe('AWAITING_DRIVER');
      // O motivo precisa sobreviver ate o historico: e a unica coisa que
      // distingue moto quebrada de motoboy escolhendo corrida.
      expect(historico.note).toContain('moto quebrou no meio do caminho');
      expect(historico.changedByUserId).toBe('user-1');
    });

    it('quem perdeu o pedido no meio do caminho recebe conflito', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'ACCEPTED',
        driverId: 'driver-1',
        batchId: null,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.returnDeliveryToQueue('delivery-1', 'driver-1', 'moto quebrou', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('o lote volta inteiro ou nenhum', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'ACCEPTED',
        driverId: 'driver-1',
        batchId: 'batch-1',
      });
      // Um irmao ja foi coletado: devolver o resto deixaria o motoboy com um
      // pedaco de uma corrida que ele acabou de dizer que nao faz.
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', status: 'ACCEPTED', driverId: 'driver-1' },
        { id: 'delivery-2', status: 'COLLECTED', driverId: 'driver-1' },
      ]);

      await expect(
        service.returnDeliveryToQueue('delivery-1', 'driver-1', 'moto quebrou', 'user-1'),
      ).rejects.toThrow('lote');
    });

    it('o motoboy que devolveu fica de fora do redespacho imediato', async () => {
      // Sem isto o pedido voltaria para a mesma pessoa em segundos — ela acabou
      // de dizer que nao consegue.
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'ACCEPTED',
        driverId: 'driver-1',
        batchId: null,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 1234,
        companyId: 'company-1',
        status: 'AWAITING_DRIVER',
      });
      const redespacho = jest.spyOn(service, 'dispatchDelivery').mockResolvedValue(undefined);

      await service.returnDeliveryToQueue('delivery-1', 'driver-1', 'moto quebrou', 'user-1');

      expect(redespacho).toHaveBeenCalledWith('delivery-1', { excludeDriverIds: ['driver-1'] });
    });

    it('a exclusao pontual entra junto com quem ja recebeu oferta', async () => {
      // A exclusao vale so para esta rodada: se daqui a meia hora ele estiver
      // de volta e o pedido continuar parado, ofertar de novo e o certo.
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        batchId: null,
        displayNumber: 1,
        company: { regionId: 'region-1', tradeName: 'Loja' },
        serviceType: { name: 'Padrão' },
        serviceTypeId: 'st-1',
        addresses: [],
        destinationKnownAtCreation: true,
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 60 });
      prisma.deliveryOffer.findMany.mockResolvedValue([{ driverId: 'ja-recebeu' }]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([]);

      await service.dispatchDelivery('delivery-1', { excludeDriverIds: ['devolveu'] });

      // Nenhum motoboy elegivel sobrou, entao nao houve oferta — o que importa
      // aqui e que a chamada aceitou as duas origens de exclusao sem quebrar.
      expect(tx.deliveryOffer.create).not.toHaveBeenCalled();
    });
  });

  describe('oferta pendente', () => {
    it('devolve null quando nao ha oferta esperando resposta', async () => {
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);

      await expect(service.findPendingOfferForDriver('driver-1')).resolves.toBeNull();
    });

    it('devolve null se o pedido saiu de AWAITING_DRIVER no meio-tempo', async () => {
      // A oferta ainda consta PENDING mas outro ja assumiu: mostrar a tela seria
      // oferecer o que nao existe mais.
      prisma.deliveryOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        deliveryId: 'delivery-1',
        offeredAt: new Date(),
      });
      prisma.delivery.findUnique.mockResolvedValue({ id: 'delivery-1', status: 'ACCEPTED' });

      await expect(service.findPendingOfferForDriver('driver-1')).resolves.toBeNull();
    });

    it('devolve a oferta com o tempo que SOBRA, nao o prazo cheio', async () => {
      // O aplicativo busca isto ao abrir. Reabrir o cronometro do zero faria o
      // motoboy decidir confiando num tempo que ele nao tem.
      const ofertadaEm = new Date(Date.now() - 40_000);
      prisma.deliveryOffer.findFirst.mockResolvedValue({
        id: 'offer-1',
        deliveryId: 'delivery-1',
        offeredAt: ofertadaEm,
      });
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 1001,
        status: 'AWAITING_DRIVER',
        batchId: null,
        paymentMethod: 'BILLED',
        destinationKnownAtCreation: true,
        totalValue: 10,
        driverValue: 8,
        platformValue: 2,
        distanceKm: 3,
        requiresReturn: false,
        company: { tradeName: 'Loja' },
        serviceType: { name: 'Padrão' },
        addresses: [],
      });
      platformSettingsService.get.mockResolvedValue({ dispatchOfferTimeoutSeconds: 120 });

      const oferta = await service.findPendingOfferForDriver('driver-1');

      expect(oferta?.offerId).toBe('offer-1');
      expect(oferta?.expiresInSeconds).toBeLessThanOrEqual(81);
      expect(oferta?.expiresInSeconds).toBeGreaterThanOrEqual(78);
    });
  });
});
