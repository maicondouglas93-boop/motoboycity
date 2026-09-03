import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { PushService } from '../push/push.service';
import { IntegrationOutboxRecorder } from '../integrations/integration-outbox-recorder.service';
import { DriverPunishmentService } from '../driver-punishment/driver-punishment.service';

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
    driver: { findUnique: jest.Mock; findFirst: jest.Mock };
    driverCompanyBlock: { findUnique: jest.Mock; findFirst: jest.Mock };
    deliveryStatusHistory: { createMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let platformSettingsService: { get: jest.Mock };
  let realtimeGateway: {
    emitToDriver: jest.Mock;
    emitAdminActivity: jest.Mock;
    emitDeliveryUpdated: jest.Mock;
  };
  let livePresence: {
    isLive: jest.Mock;
    orderForDispatch: jest.Mock;
    moveToDispatchTail: jest.Mock;
  };
  let push: { sendToDriver: jest.Mock };
  let queue: { add: jest.Mock; remove: jest.Mock; getJob: jest.Mock };
  let punishment: {
    punishedDriverIds: jest.Mock;
    activeFor: jest.Mock;
    registerRefusal: jest.Mock;
    registerAcceptance: jest.Mock;
  };
  let tx: {
    $queryRaw: jest.Mock;
    driver: { findFirst: jest.Mock };
    delivery: {
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
    };
    deliveryOffer: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock; createMany: jest.Mock };
    driverPunishment: { findFirst: jest.Mock };
    driverCompanyBlock: { findUnique: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'delivery-1' }]),
      driver: { findFirst: jest.fn().mockResolvedValue({ id: 'driver-1' }) },
      delivery: {
        update: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      deliveryOffer: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      deliveryStatusHistory: { create: jest.fn(), createMany: jest.fn() },
      driverPunishment: { findFirst: jest.fn().mockResolvedValue(null) },
      driverCompanyBlock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
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
        // Padrao: a escrita condicional encontra a oferta ainda pendente. Os
        // testes de corrida sobrescrevem com `{ count: 0 }`.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
      },
      driverPresenceLog: { findMany: jest.fn() },
      driver: {
        findUnique: jest.fn(),
        // Padrao: o motoboy atende a regiao e a modalidade do pedido.
        findFirst: jest.fn().mockResolvedValue({ id: 'driver-1' }),
      },
      driverCompanyBlock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      deliveryStatusHistory: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    livePresence = {
      isLive: jest.fn().mockResolvedValue(true),
      orderForDispatch: jest.fn().mockImplementation(async (driverIds: string[]) => driverIds),
      moveToDispatchTail: jest.fn().mockResolvedValue(undefined),
    };
    push = { sendToDriver: jest.fn().mockResolvedValue(1) };
    queue = { add: jest.fn(), remove: jest.fn(), getJob: jest.fn().mockResolvedValue(null) };
    /** Padrao de producao: punicao desligada, ninguem cumprindo castigo. */
    punishment = {
      punishedDriverIds: jest.fn().mockResolvedValue([]),
      activeFor: jest.fn().mockResolvedValue(null),
      registerRefusal: jest.fn().mockResolvedValue(null),
      registerAcceptance: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: LiveDriverPresenceService, useValue: livePresence },
        { provide: PushService, useValue: push },
        { provide: getQueueToken(DISPATCH_QUEUE), useValue: queue },
        { provide: IntegrationOutboxRecorder, useValue: { record: jest.fn() } },
        { provide: DriverPunishmentService, useValue: punishment },
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

  describe('releasePendingOffersForDriver', () => {
    it('pode soltar somente ofertas da empresa bloqueada', async () => {
      prisma.deliveryOffer.findMany.mockResolvedValue([]);

      await service.releasePendingOffersForDriver('driver-1', 'company-1');

      expect(prisma.deliveryOffer.findMany).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-1',
          response: 'PENDING',
          delivery: { companyId: 'company-1' },
        },
        select: { id: true },
      });
    });

    it('redespacha de forma idempotente uma oferta que já ficou EXPIRED', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        response: 'EXPIRED',
        deliveryId: 'delivery-1',
      });
      const dispatch = jest.spyOn(service, 'dispatchDelivery').mockResolvedValue(undefined);

      await service.handleOfferExpired('offer-1');

      expect(dispatch).toHaveBeenCalledWith('delivery-1');
    });

    it('mantém o timeout como compensação quando a expiração falha', async () => {
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }]);
      jest.spyOn(service, 'handleOfferExpired').mockRejectedValue(new Error('database offline'));

      await expect(service.releasePendingOffersForDriver('driver-1')).rejects.toThrow(
        'database offline',
      );

      expect(queue.remove).not.toHaveBeenCalled();
    });

    it('retoma o redespacho quando a oferta já expirou antes da falha', async () => {
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }]);
      prisma.deliveryOffer.findUnique.mockResolvedValue({ response: 'EXPIRED' });
      const expiration = jest
        .spyOn(service, 'handleOfferExpired')
        .mockRejectedValueOnce(new Error('redespacho falhou'))
        .mockResolvedValueOnce(undefined);

      await expect(service.releasePendingOffersForDriver('driver-1')).resolves.toBe(1);

      expect(expiration).toHaveBeenCalledTimes(2);
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
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

  describe('reofferDeliveryToDriver', () => {
    const awaitingDelivery = () => ({
      id: 'delivery-1',
      displayNumber: 25049,
      status: 'AWAITING_DRIVER',
      driverId: null,
      batchId: null,
      companyId: 'company-1',
      serviceTypeId: 'service-1',
      destinationKnownAtCreation: true,
      totalValue: new Prisma.Decimal(12),
      driverValue: new Prisma.Decimal(10),
      platformValue: new Prisma.Decimal(2),
      distanceKm: new Prisma.Decimal(3),
      requiresReturn: false,
      paymentMethod: 'BILLED',
      createdAt: new Date('2026-08-28T20:00:00.000Z'),
      company: { regionId: 'region-1', tradeName: 'Loja teste' },
      serviceType: { name: 'Motoboy' },
      addresses: [offerPickupAddress, offerDropoffAddress],
    });

    it('cria nova oferta para quem ja recebeu antes e faz socket e push tocarem', async () => {
      prisma.delivery.findUnique.mockResolvedValue(awaitingDelivery());
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.deliveryOffer.findMany.mockResolvedValue([
        { driverId: 'driver-1', response: 'DECLINED' },
      ]);
      prisma.driver.findFirst.mockResolvedValue({
        id: 'driver-1',
        user: { name: 'Motoboy escolhido' },
      });
      tx.deliveryOffer.create.mockResolvedValue({
        id: 'offer-new',
        deliveryId: 'delivery-1',
        driverId: 'driver-1',
        response: 'PENDING',
        offeredAt: new Date(),
        respondedAt: null,
      });

      const result = await service.reofferDeliveryToDriver('delivery-1', 'driver-1', {
        adminId: 'admin-1',
        adminName: 'Administrador',
        reason: 'Todos recusaram a primeira rodada.',
      });

      expect(result).toEqual({
        deliveryIds: ['delivery-1'],
        driverId: 'driver-1',
        driverName: 'Motoboy escolhido',
        offerIds: ['offer-new'],
      });
      expect(prisma.deliveryOffer.findMany).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'offer-expire',
        { offerId: 'offer-new' },
        expect.objectContaining({ jobId: 'expire-offer-new' }),
      );
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'delivery:offer',
        expect.objectContaining({ offerId: 'offer-new', deliveryId: 'delivery-1' }),
      );
      expect(push.sendToDriver).toHaveBeenCalledWith(
        'driver-1',
        expect.objectContaining({ kind: 'offer' }),
      );
      expect(prisma.deliveryStatusHistory.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            deliveryId: 'delivery-1',
            changedByUserId: 'admin-1',
            note: expect.stringContaining('Todos recusaram a primeira rodada.'),
          }),
        ],
      });
    });

    it('nao disputa um pedido que ja esta tocando para outro motoboy', async () => {
      prisma.delivery.findUnique.mockResolvedValue(awaitingDelivery());
      prisma.deliveryOffer.findFirst.mockResolvedValue({ id: 'offer-pending' });

      await expect(
        service.reofferDeliveryToDriver('delivery-1', 'driver-1', {
          adminId: 'admin-1',
          adminName: 'Administrador',
          reason: 'Reenvio solicitado pela operacao.',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.deliveryOffer.create).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('recusa o reenvio quando o motoboy perdeu a presenca online', async () => {
      prisma.delivery.findUnique.mockResolvedValue(awaitingDelivery());
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.driver.findFirst.mockResolvedValue({
        id: 'driver-1',
        user: { name: 'Motoboy offline' },
      });
      livePresence.isLive.mockResolvedValue(false);

      await expect(
        service.reofferDeliveryToDriver('delivery-1', 'driver-1', {
          adminId: 'admin-1',
          adminName: 'Administrador',
          reason: 'Reenvio solicitado pela operacao.',
        }),
      ).rejects.toThrow('O motoboy esta sem localizacao online neste momento.');

      expect(tx.deliveryOffer.create).not.toHaveBeenCalled();
    });
  });

  describe('dispatchDelivery', () => {
    it('respeita a sequencia editada pelo admin entre os motoboys elegiveis', async () => {
      prisma.deliveryOffer.findMany.mockResolvedValue([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([
        { driverId: 'driver-1' },
        { driverId: 'driver-2' },
      ]);
      livePresence.orderForDispatch.mockResolvedValue(['driver-2', 'driver-1']);

      const driverId = await (
        service as unknown as {
          findNextEligibleDriverId(input: {
            excludeDriverIds: string[];
            companyId: string;
            regionId: string;
            serviceTypeIds: string[];
          }): Promise<string | null>;
        }
      ).findNextEligibleDriverId({
        excludeDriverIds: [],
        companyId: 'company-1',
        regionId: 'region-1',
        serviceTypeIds: ['service-1'],
      });

      expect(driverId).toBe('driver-2');
      expect(livePresence.orderForDispatch).toHaveBeenCalledWith(['driver-1', 'driver-2']);
    });

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
        companyId: 'company-1',
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
        companyId: 'company-1',
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
        offeredAt: new Date(),
      });

      await service.dispatchDelivery('delivery-1');

      expect(tx.deliveryOffer.create).toHaveBeenCalledWith({
        data: { deliveryId: 'delivery-1', driverId: 'driver-1', response: 'PENDING' },
      });
      expect(livePresence.moveToDispatchTail).toHaveBeenCalledWith('driver-1');
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
        expiresAtEpochMs: expect.any(Number),
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
              companyBlocks: { none: { companyId: 'company-1' } },
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

    it('tenta o próximo motoboy quando o primeiro ficou ocupado antes do commit', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        destinationKnownAtCreation: true,
        totalValue: { toString: () => '16.90' },
        driverValue: { toString: () => '13.52' },
        platformValue: { toString: () => '3.38' },
        distanceKm: { toString: () => '5.43' },
        requiresReturn: false,
        paymentMethod: 'BILLED',
        company: { regionId: 'region-1', tradeName: 'Loja de teste' },
        serviceType: { name: 'Motofrete' },
        addresses: [offerPickupAddress, offerDropoffAddress],
        serviceTypeId: 'service-1',
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.deliveryOffer.findMany.mockResolvedValue([]);
      prisma.driverPresenceLog.findMany
        .mockResolvedValueOnce([{ driverId: 'driver-1' }])
        .mockResolvedValueOnce([{ driverId: 'driver-2' }]);
      tx.deliveryOffer.findFirst
        .mockResolvedValueOnce({ id: 'offer-for-another-delivery' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      tx.deliveryOffer.create.mockResolvedValue({
        id: 'offer-2',
        deliveryId: 'delivery-1',
        driverId: 'driver-2',
        offeredAt: new Date(),
      });

      await service.dispatchDelivery('delivery-1');

      expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
      expect(tx.deliveryOffer.findFirst).toHaveBeenCalledWith({
        where: { driverId: 'driver-1', response: 'PENDING' },
        select: { id: true },
      });
      expect(tx.deliveryOffer.create).toHaveBeenCalledWith({
        data: { deliveryId: 'delivery-1', driverId: 'driver-2', response: 'PENDING' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'offer-expire',
        { offerId: 'offer-2' },
        expect.objectContaining({ jobId: 'expire-offer-2' }),
      );
    });

    it('expira a oferta criada quando o timeout não pode ser agendado', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        displayNumber: 7,
        destinationKnownAtCreation: true,
        totalValue: { toString: () => '16.90' },
        driverValue: { toString: () => '13.52' },
        platformValue: { toString: () => '3.38' },
        distanceKm: { toString: () => '5.43' },
        requiresReturn: false,
        paymentMethod: 'BILLED',
        company: { regionId: 'region-1', tradeName: 'Loja de teste' },
        serviceType: { name: 'Motofrete' },
        addresses: [offerPickupAddress, offerDropoffAddress],
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
        offeredAt: new Date(),
      });
      queue.add.mockRejectedValueOnce(new Error('redis indisponivel'));

      await expect(service.dispatchDelivery('delivery-1')).rejects.toThrow('redis indisponivel');

      expect(prisma.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['offer-1'] }, response: 'PENDING' },
        data: { response: 'EXPIRED', respondedAt: expect.any(Date) },
      });
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
      expect(push.sendToDriver).not.toHaveBeenCalled();
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
        offeredAt: new Date(),
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
      tx.deliveryOffer.create.mockResolvedValue({ id: 'offer-2', offeredAt: new Date() });

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
      prisma.deliveryOffer.findMany.mockResolvedValue([]);
      prisma.driverPresenceLog.findMany
        .mockResolvedValueOnce([{ driverId: 'driver-1' }])
        .mockResolvedValueOnce([]);
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
        .mockResolvedValueOnce({ id: 'offer-1', offeredAt: new Date() })
        .mockResolvedValueOnce({ id: 'offer-2', offeredAt: new Date() });

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
        expiresAtEpochMs: expect.any(Number),
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

  /**
   * A varredura existe porque o despacho era 100% orientado a evento: o pedido
   * agendado tinha UM gatilho, o job no Redis, e um `queue.add` que falhasse
   * deixava o pedido esperando uma hora que nunca chegava. Nada olhava para
   * `SCHEDULED` — nem a reconciliacao de presenca, nem a varredura de fila.
   */
  describe('sweepStuckDeliveries', () => {
    it('reagenda o agendado futuro cujo job sumiu, antes de ele atrasar', async () => {
      const daquiUmaHora = new Date(Date.now() + 3_600_000);
      prisma.delivery.findMany
        .mockResolvedValueOnce([{ id: 'delivery-1', scheduledAt: daquiUmaHora }])
        .mockResolvedValueOnce([]);
      queue.getJob.mockResolvedValue(null);

      await service.sweepStuckDeliveries();

      expect(queue.getJob).toHaveBeenCalledWith('activate-delivery-1');
      expect(queue.add).toHaveBeenCalledWith(
        'activate-scheduled',
        { deliveryId: 'delivery-1' },
        expect.objectContaining({ jobId: 'activate-delivery-1' }),
      );
    });

    it('não mexe no agendado que ainda tem job', async () => {
      const daquiUmaHora = new Date(Date.now() + 3_600_000);
      prisma.delivery.findMany
        .mockResolvedValueOnce([{ id: 'delivery-1', scheduledAt: daquiUmaHora }])
        .mockResolvedValueOnce([]);
      queue.getJob.mockResolvedValue({ id: 'activate-delivery-1' });

      await service.sweepStuckDeliveries();

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('ativa direto o agendado cuja hora já passou', async () => {
      prisma.delivery.findMany
        .mockResolvedValueOnce([{ id: 'delivery-1', scheduledAt: new Date(Date.now() - 60_000) }])
        .mockResolvedValueOnce([]);
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'SCHEDULED',
        displayNumber: 7,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });

      await service.sweepStuckDeliveries();

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'SCHEDULED' },
        data: { status: 'AWAITING_DRIVER', statusChangedAt: expect.any(Date) },
      });
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

    /**
     * A leitura acima diz PENDING; a escrita descobre que nao esta mais.
     *
     * E o empate real: o motoboy apertando recusar no segundo em que o job
     * dispara, ou a loja cancelando nesse instante. Antes da escrita
     * condicional, este caminho sobrepunha a resposta e ainda contabilizava a
     * recusa — dobrando a contagem de quem recusou, e punindo quem nao fez
     * nada quando quem desistiu foi a loja.
     */
    it('perde a corrida para a resposta do motoboy: não sobrescreve nem contabiliza', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        response: 'PENDING',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.delivery.findUnique.mockResolvedValue(null);
      prisma.deliveryOffer.updateMany.mockResolvedValue({ count: 0 });

      await service.handleOfferExpired('offer-1');

      expect(punishment.registerRefusal).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalledWith(
        'driver-1',
        'delivery:offer-expired',
        expect.anything(),
      );
      expect(push.sendToDriver).not.toHaveBeenCalled();
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

      expect(prisma.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', response: 'PENDING' },
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

  describe('handlePickupExpired', () => {
    it('devolve o pedido aceito a fila, avisa o motoboy e redespacha sem ele', async () => {
      const deadlineAt = new Date('2026-08-27T18:20:00.000Z');
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 77,
        companyId: 'company-1',
        batchId: null,
        status: 'ACCEPTED',
        driverId: 'driver-1',
        pickupDeadlineAt: deadlineAt,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      const redespacho = jest.spyOn(service, 'dispatchDelivery').mockResolvedValue(undefined);

      await service.handlePickupExpired('delivery-1', 'driver-1', deadlineAt.toISOString());

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['delivery-1'] },
          status: 'ACCEPTED',
          driverId: 'driver-1',
          pickupDeadlineAt: deadlineAt,
        },
        data: {
          status: 'AWAITING_DRIVER',
          driverId: null,
          pickupDeadlineAt: null,
          statusChangedAt: expect.any(Date),
        },
      });
      expect(tx.deliveryStatusHistory.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            deliveryId: 'delivery-1',
            fromStatus: 'ACCEPTED',
            toStatus: 'AWAITING_DRIVER',
          }),
        ],
      });
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'delivery:pickup-expired',
        { deliveryIds: ['delivery-1'] },
      );
      expect(redespacho).toHaveBeenCalledWith('delivery-1', {
        excludeDriverIds: ['driver-1'],
      });
    });

    it('devolve todos os itens de um lote na mesma transacao', async () => {
      const deadlineAt = new Date('2026-08-27T18:20:00.000Z');
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 77,
        companyId: 'company-1',
        batchId: 'batch-1',
        status: 'ACCEPTED',
        driverId: 'driver-1',
        pickupDeadlineAt: deadlineAt,
      });
      prisma.delivery.findMany.mockResolvedValue([
        {
          id: 'delivery-1',
          displayNumber: 77,
          companyId: 'company-1',
          batchId: 'batch-1',
        },
        {
          id: 'delivery-2',
          displayNumber: 78,
          companyId: 'company-1',
          batchId: 'batch-1',
        },
      ]);
      tx.delivery.updateMany.mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'dispatchDelivery').mockResolvedValue(undefined);

      await service.handlePickupExpired('delivery-1', 'driver-1', deadlineAt.toISOString());

      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['delivery-1', 'delivery-2'] } }),
        }),
      );
      expect(tx.deliveryStatusHistory.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ deliveryId: 'delivery-1' }),
          expect.objectContaining({ deliveryId: 'delivery-2' }),
        ]),
      });
    });

    it('nao remove a atribuicao se a coleta venceu a corrida concorrente', async () => {
      const deadlineAt = new Date('2026-08-27T18:20:00.000Z');
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 77,
        companyId: 'company-1',
        batchId: null,
        status: 'ACCEPTED',
        driverId: 'driver-1',
        pickupDeadlineAt: deadlineAt,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await service.handlePickupExpired('delivery-1', 'driver-1', deadlineAt.toISOString());

      expect(tx.deliveryStatusHistory.createMany).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
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
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });

      await service.handleScheduledActivation('delivery-1');

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'SCHEDULED' },
        data: { status: 'AWAITING_DRIVER', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: { deliveryId: 'delivery-1', fromStatus: 'SCHEDULED', toStatus: 'AWAITING_DRIVER' },
      });
    });

    /**
     * `cancelScheduledActivation` remove o job da fila, mas remover nao
     * interrompe um job que ja comecou. A loja cancelando entre a leitura e a
     * escrita fazia o pedido cancelado voltar para a fila e ser ofertado.
     */
    it('não ativa o pedido que foi cancelado depois da leitura', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'SCHEDULED',
        displayNumber: 3,
      });
      tx.delivery.updateMany.mockResolvedValue({ count: 0 });

      await service.handleScheduledActivation('delivery-1');

      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
      expect(realtimeGateway.emitDeliveryUpdated).not.toHaveBeenCalled();
    });
  });

  describe('cancelOfferTimeout', () => {
    it('remove o job de expiração pelo jobId derivado da oferta', async () => {
      await service.cancelOfferTimeout('offer-1');

      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
    });
  });

  describe('acceptOffer', () => {
    beforeEach(() => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        companyId: 'company-1',
        batchId: null,
      });
    });
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

    it('recusa oferta pendente quando o ADM bloqueou a empresa para o motoboy', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        response: 'PENDING',
      });
      prisma.driverCompanyBlock.findFirst.mockResolvedValue({ id: 'block-1' });

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).rejects.toThrow(
        'nao pode atender pedidos desta empresa',
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
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 9,
        companyId: 'company-1',
      });
      prisma.delivery.findMany.mockResolvedValue([
        {
          id: 'delivery-1',
          displayNumber: 9,
          companyId: 'company-1',
          company: { tradeName: 'Drogaria Nova Farma' },
        },
      ]);
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        user: { name: 'Maicon Douglas' },
      });

      const result = await service.acceptOffer('offer-1', 'driver-1', 'user-1');

      expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', response: 'PENDING' },
        data: { response: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'AWAITING_DRIVER' },
        data: {
          status: 'ACCEPTED',
          driverId: 'driver-1',
          statusChangedAt: expect.any(Date),
          pickupDeadlineAt: null,
        },
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
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Pedido #9 da empresa Drogaria Nova Farma foi aceito por Maicon Douglas.',
          companyName: 'Drogaria Nova Farma',
          driverName: 'Maicon Douglas',
        }),
      );
      expect(result).toEqual({ deliveryId: 'delivery-1', displayNumber: 9 });
    });

    it('mantem o aceite confirmado quando o Redis falha ao limpar o timeout', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 9,
        companyId: 'company-1',
      });
      prisma.delivery.findMany.mockResolvedValue([
        {
          id: 'delivery-1',
          displayNumber: 9,
          companyId: 'company-1',
          company: { tradeName: 'Loja A' },
        },
      ]);
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        user: { name: 'Motoboy A' },
      });
      queue.remove.mockReturnValueOnce(new Promise(() => undefined));

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).resolves.toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 9,
      });

      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(tx.deliveryOffer.updateMany).toHaveBeenCalled();
      expect(tx.delivery.updateMany).toHaveBeenCalled();
    });

    it('reconcilia aceite anterior mesmo se o Redis falhar ao conferir o prazo', async () => {
      const deadlineAt = new Date('2026-09-03T18:00:00.000Z');
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        response: 'ACCEPTED',
      });
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 9,
        driverId: 'driver-1',
        batchId: null,
        status: 'ACCEPTED',
        pickupDeadlineAt: deadlineAt,
      });
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }]);
      queue.add.mockRejectedValueOnce(new Error('redis indisponivel'));

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).resolves.toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 9,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('congela o prazo configurado e agenda a expiracao antes de aceitar', async () => {
      platformSettingsService.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: 60,
        pickupAssignmentTimeoutMinutes: 20,
      });
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 9,
        companyId: 'company-1',
      });

      await service.acceptOffer('offer-1', 'driver-1', 'user-1');

      expect(queue.add).toHaveBeenCalledWith(
        'pickup-expire',
        expect.objectContaining({
          deliveryId: 'delivery-1',
          expectedDriverId: 'driver-1',
          expectedDeadlineAt: expect.any(String),
        }),
        expect.objectContaining({ delay: expect.any(Number), attempts: 5 }),
      );
      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pickupDeadlineAt: expect.any(Date) }),
        }),
      );
    });

    it('devolve o mesmo aceite quando a primeira resposta se perdeu', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        response: 'ACCEPTED',
      });
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 9,
        driverId: 'driver-1',
        batchId: null,
      });
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }]);

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).resolves.toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 9,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
    });

    it('reconcilia o aceite quando perde a corrida para a própria primeira solicitação', async () => {
      prisma.deliveryOffer.findUnique
        .mockResolvedValueOnce({
          id: 'offer-1',
          driverId: 'driver-1',
          deliveryId: 'delivery-1',
          response: 'PENDING',
        })
        .mockResolvedValueOnce({
          id: 'offer-1',
          driverId: 'driver-1',
          deliveryId: 'delivery-1',
          response: 'ACCEPTED',
        });
      prisma.delivery.findUnique
        .mockResolvedValueOnce({ id: 'delivery-1', companyId: 'company-1', batchId: null })
        .mockResolvedValueOnce({
          id: 'delivery-1',
          displayNumber: 9,
          driverId: 'driver-1',
          batchId: null,
        });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 0 });
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }]);

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).resolves.toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 9,
      });
    });
  });

  describe('batch offer responses', () => {
    it('aceita todas as ofertas e entregas do lote em uma única transação', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        companyId: 'company-1',
        batchId: 'batch-1',
      });
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', displayNumber: 7, companyId: 'company-1' },
        { id: 'delivery-2', displayNumber: 8, companyId: 'company-1' },
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
        data: {
          status: 'ACCEPTED',
          driverId: 'driver-1',
          statusChangedAt: expect.any(Date),
          pickupDeadlineAt: null,
        },
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

    it('mantem o aceite do lote quando um timeout nao pode ser removido', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        companyId: 'company-1',
        batchId: 'batch-1',
      });
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', displayNumber: 7, companyId: 'company-1' },
        { id: 'delivery-2', displayNumber: 8, companyId: 'company-1' },
      ]);
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }, { id: 'offer-2' }]);
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 2 });
      tx.delivery.updateMany.mockResolvedValue({ count: 2 });
      queue.remove
        .mockRejectedValueOnce(new Error('redis indisponivel'))
        .mockResolvedValueOnce(undefined);

      await expect(service.acceptOffer('offer-1', 'driver-1', 'user-1')).resolves.toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 7,
        batchId: 'batch-1',
        deliveryIds: ['delivery-1', 'delivery-2'],
        displayNumbers: [7, 8],
      });

      expect(queue.remove).toHaveBeenCalledWith('expire-offer-1');
      expect(queue.remove).toHaveBeenCalledWith('expire-offer-2');
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

      expect(prisma.deliveryOffer.updateMany).toHaveBeenCalledWith({
        where: { id: 'offer-1', response: 'PENDING' },
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
        serviceTypeId: 'service-1',
        company: { regionId: 'region-1' },
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
        serviceTypeId: 'service-1',
        company: { regionId: 'region-1' },
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
        serviceTypeId: 'service-1',
        company: { regionId: 'region-1' },
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
        data: {
          status: 'ACCEPTED',
          driverId: 'driver-1',
          statusChangedAt: expect.any(Date),
          pickupDeadlineAt: null,
        },
      });
      const historico = tx.deliveryStatusHistory.create.mock.calls[0]?.[0]?.data;
      expect(historico.note).toContain('pedidos disponíveis');
      expect(historico.changedByUserId).toBe('user-1');
    });

    /**
     * A vitrine filtra o teto na LISTAGEM, e a listagem pode estar velha na
     * tela. Sem esta checagem, uma tela desatualizada ou uma chamada direta a
     * API entrava por cima do limite que o operador configurou.
     */
    it('recusa quando o motoboy já está no teto de entregas simultâneas', async () => {
      platformSettingsService.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: 60,
        maxConcurrentDeliveriesPerDriver: 3,
        maxDeliveriesPerBatch: null,
      });
      prisma.delivery.count.mockResolvedValue(3);
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: null,
        serviceTypeId: 'service-1',
        company: { regionId: 'region-1' },
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);

      await expect(service.claimDelivery('delivery-1', 'driver-1', 'user-1')).rejects.toThrow(
        'limite de entregas simultâneas',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    /**
     * A conta certa nunca foi "cabe mais uma?" e sim "cabe o que estou prestes
     * a assumir?". Com duas em andamento e teto de tres, um lote de tres
     * passava pela pergunta antiga e deixava o motoboy com cinco.
     */
    it('recusa o lote que não cabe inteiro no teto, mesmo cabendo mais uma', async () => {
      platformSettingsService.get.mockResolvedValue({
        dispatchOfferTimeoutSeconds: 60,
        maxConcurrentDeliveriesPerDriver: 3,
        maxDeliveriesPerBatch: null,
      });
      prisma.delivery.count.mockResolvedValue(2);
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: 'batch-1',
        serviceTypeId: 'service-1',
        company: { regionId: 'region-1' },
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.delivery.findMany.mockResolvedValue([
        { id: 'delivery-1', status: 'AWAITING_DRIVER', driverId: null, serviceTypeId: 'service-1' },
        { id: 'delivery-2', status: 'AWAITING_DRIVER', driverId: null, serviceTypeId: 'service-1' },
      ]);

      await expect(service.claimDelivery('delivery-1', 'driver-1', 'user-1')).rejects.toThrow(
        'lote não cabe',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa quem não atende a região ou a modalidade do pedido', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        batchId: null,
        serviceTypeId: 'service-1',
        company: { regionId: 'region-1' },
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(service.claimDelivery('delivery-1', 'driver-1', 'user-1')).rejects.toThrow(
        'região ou à modalidade',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('devolve o mesmo claim quando a primeira resposta se perdeu', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 1234,
        status: 'ACCEPTED',
        driverId: 'driver-1',
        batchId: null,
      });

      await expect(service.claimDelivery('delivery-1', 'driver-1', 'user-1')).resolves.toEqual({
        deliveryId: 'delivery-1',
        displayNumber: 1234,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
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
          pickupDeadlineAt: null,
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
      expect(oferta?.expiresAtEpochMs).toBe(ofertadaEm.getTime() + 120_000);
    });
  });

  /**
   * A punicao propriamente dita e testada em
   * `driver-punishment.service.spec.ts`. Aqui interessa outra coisa: se o
   * despacho chama a regra nos lugares certos, deixa de chamar onde nao deve, e
   * se ela realmente tira o motoboy da selecao.
   */
  describe('punição por recusa', () => {
    it('contabiliza a recusa explícita antes de procurar o próximo motoboy', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      prisma.delivery.findUnique.mockResolvedValue(null);

      await service.declineOffer('offer-1', 'driver-1');

      expect(punishment.registerRefusal).toHaveBeenCalledWith({
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        kind: 'DECLINED',
      });
    });

    it('contabiliza a expiração do prazo como resposta não dada', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        response: 'PENDING',
      });
      prisma.delivery.findUnique.mockResolvedValue(null);

      await service.handleOfferExpired('offer-1');

      expect(punishment.registerRefusal).toHaveBeenCalledWith({
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        kind: 'EXPIRED',
      });
    });

    it('NÃO pune o motoboy cujas ofertas foram devolvidas por bloqueio do admin', async () => {
      // O motoboy nao respondeu nada: quem tirou a oferta da mao dele foi o
      // administrador. Cobrar isso como recusa puniria a vitima da decisao.
      prisma.deliveryOffer.findMany.mockResolvedValue([{ id: 'offer-1' }]);
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        response: 'PENDING',
      });
      prisma.delivery.findUnique.mockResolvedValue(null);

      await service.releasePendingOffersForDriver('driver-1');

      expect(punishment.registerRefusal).not.toHaveBeenCalled();
    });

    it('agenda o job que acorda o despacho quando o prazo da punição vencer', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      prisma.delivery.findUnique.mockResolvedValue(null);
      punishment.registerRefusal.mockResolvedValue({
        id: 'punicao-1',
        expiresAt: new Date(Date.now() + 40 * 60_000),
      });

      await service.declineOffer('offer-1', 'driver-1');

      expect(queue.add).toHaveBeenCalledWith(
        'punishment-expire',
        { punishmentId: 'punicao-1' },
        expect.objectContaining({ jobId: 'punishment-expire-punicao-1' }),
      );
    });

    it('não deixa uma falha da punição interromper o redespacho do pedido', async () => {
      // O pedido e do cliente; a punicao e gestao de frota. Se a segunda falhar,
      // o primeiro precisa continuar procurando motoboy.
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
      });
      prisma.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      prisma.delivery.findUnique.mockResolvedValue(null);
      punishment.registerRefusal.mockRejectedValue(new Error('banco fora do ar'));

      await expect(service.declineOffer('offer-1', 'driver-1')).resolves.toBeUndefined();
      expect(prisma.delivery.findUnique).toHaveBeenCalledWith({ where: { id: 'delivery-1' } });
    });

    it('zera a sequência de recusas quando o motoboy aceita', async () => {
      prisma.deliveryOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        response: 'PENDING',
      });
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        companyId: 'company-1',
        batchId: null,
      });
      tx.deliveryOffer.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.updateMany.mockResolvedValue({ count: 1 });
      tx.delivery.findUniqueOrThrow.mockResolvedValue({
        id: 'delivery-1',
        displayNumber: 7,
        companyId: 'company-1',
      });
      prisma.delivery.findMany.mockResolvedValue([]);
      prisma.driver.findUnique.mockResolvedValue(null);

      await service.acceptOffer('offer-1', 'driver-1', 'user-1');

      expect(punishment.registerAcceptance).toHaveBeenCalledWith('driver-1');
    });

    it('exclui da seleção o motoboy que está cumprindo punição', async () => {
      punishment.punishedDriverIds.mockResolvedValue(['driver-punido']);
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        batchId: null,
        serviceTypeId: 'service-1',
        displayNumber: 5,
        company: { regionId: 'region-1', tradeName: 'Loja' },
        serviceType: { name: 'Padrão' },
        addresses: [],
      });
      prisma.deliveryOffer.findFirst.mockResolvedValue(null);
      prisma.deliveryOffer.findMany.mockResolvedValue([]);
      prisma.driverPresenceLog.findMany.mockResolvedValue([]);

      await service.dispatchDelivery('delivery-1');

      expect(prisma.driverPresenceLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driverId: { notIn: expect.arrayContaining(['driver-punido']) },
          }),
        }),
      );
    });

    it('esconde a vitrine de pedidos disponíveis durante a punição', async () => {
      // Sem isto a regra nao teria efeito: bastaria recusar e pegar o mesmo
      // pedido na lista de disponiveis um segundo depois.
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        regionId: 'region-1',
        serviceTypes: [{ serviceTypeId: 'service-1' }],
      });
      punishment.activeFor.mockResolvedValue({ expiresAt: '2026-08-28T12:40:00.000Z' });

      await expect(service.listAvailableForDriver('driver-1')).resolves.toEqual([]);
      expect(prisma.delivery.findMany).not.toHaveBeenCalled();
    });

    it('recusa assumir um pedido direto da vitrine durante a punição', async () => {
      prisma.delivery.findUnique.mockResolvedValue({
        id: 'delivery-1',
        status: 'AWAITING_DRIVER',
        driverId: null,
        displayNumber: 5,
        batchId: null,
      });
      punishment.activeFor.mockResolvedValue({ expiresAt: '2026-08-28T12:40:00.000Z' });

      await expect(
        service.claimDelivery('delivery-1', 'driver-1', 'user-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
