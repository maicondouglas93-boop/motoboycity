import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationSilenceService } from '../../tracking/location-silence.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { DispatchService } from '../../dispatch/dispatch.service';
import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService', () => {
  let service: AdminOperationsService;
  const admin = { id: 'admin-1', name: 'Administrador', type: 'ADMIN' } as User;
  const prisma = {
    driver: { findMany: jest.fn() },
    deliveryStatusHistory: { findMany: jest.fn() },
    deliveryOffer: { findMany: jest.fn() },
    driverPresenceLog: { findMany: jest.fn() },
  };
  const deliveriesService = { operations: jest.fn() };
  const livePresenceService = {
    listActive: jest.fn(),
    orderForDispatch: jest.fn(),
    replaceDispatchOrder: jest.fn(),
  };
  const locationSilenceService = { listSilentDrivers: jest.fn() };
  const realtimeGateway = {
    emitAdminActivity: jest.fn(),
    emitDispatchQueueUpdated: jest.fn(),
  };
  const dispatchService = { reofferDeliveryToDriver: jest.fn() };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T16:00:00.000Z'));
    jest.clearAllMocks();
    deliveriesService.operations.mockResolvedValue({
      active: [],
      recent: [],
      counts: { COMPLETED: 12, CANCELLED: 4 },
    });
    livePresenceService.listActive.mockResolvedValue([]);
    livePresenceService.orderForDispatch.mockImplementation(
      async (driverIds: string[]) => driverIds,
    );
    livePresenceService.replaceDispatchOrder.mockResolvedValue(undefined);
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.deliveryStatusHistory.findMany.mockResolvedValue([]);
    prisma.deliveryOffer.findMany.mockResolvedValue([]);
    prisma.driverPresenceLog.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOperationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveriesService, useValue: deliveriesService },
        { provide: LiveDriverPresenceService, useValue: livePresenceService },
        { provide: LocationSilenceService, useValue: locationSilenceService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: DispatchService, useValue: dispatchService },
      ],
    }).compile();

    service = module.get(AdminOperationsService);
  });

  it('reoferta manualmente para o motoboy escolhido com auditoria do admin', async () => {
    dispatchService.reofferDeliveryToDriver.mockResolvedValue({
      deliveryIds: ['delivery-1'],
      driverId: 'driver-1',
      driverName: 'Motoboy',
      offerIds: ['offer-2'],
    });

    await service.reofferDelivery(admin, 'delivery-1', {
      driverId: 'driver-1',
      reason: 'Todos recusaram a primeira rodada.',
    });

    expect(dispatchService.reofferDeliveryToDriver).toHaveBeenCalledWith(
      'delivery-1',
      'driver-1',
      {
        adminId: 'admin-1',
        adminName: 'Administrador',
        reason: 'Todos recusaram a primeira rodada.',
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('remove concluidos e busca todos os cancelados dos ultimos 15 minutos', async () => {
    const result = await service.overview(admin, {});

    expect(deliveriesService.operations).toHaveBeenCalledWith(
      admin,
      {},
      {
        statuses: ['CANCELLED'],
        changedSince: new Date('2026-08-23T15:45:00.000Z'),
        limit: null,
      },
    );
    expect(result.counts).toEqual(expect.objectContaining({ COMPLETED: 0, CANCELLED: 0 }));
  });

  describe('foto do motoboy no mapa', () => {
    function motoboyOnline(avatarUrl: string | null) {
      livePresenceService.listActive.mockResolvedValue([
        {
          driverId: 'motoboy-1',
          lat: -20.1522,
          lng: -41.6232,
          capturedAt: new Date('2026-08-23T15:59:00.000Z'),
          accuracy: 12,
          appVersion: '1.0.0',
        },
      ]);
      prisma.driver.findMany.mockResolvedValue([
        {
          id: 'motoboy-1',
          user: { name: 'Franklim Melo', phone: '33999887766', avatarUrl },
          presenceLogs: [{ wentOnlineAt: new Date('2026-08-23T15:00:00.000Z') }],
          serviceTypes: [],
          deliveries: [],
        },
      ]);
    }

    it('pede a foto junto do nome e do telefone', async () => {
      motoboyOnline(null);

      await service.overview(admin, {});

      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            user: { select: { name: true, phone: true, avatarUrl: true } },
          }),
        }),
      );
    });

    it('entrega a foto quando o motoboy tem uma', async () => {
      motoboyOnline('https://ik.imagekit.io/exemplo/foto.jpg');

      const resultado = await service.overview(admin, {});

      expect(resultado.onlineDrivers[0]?.avatarUrl).toBe('https://ik.imagekit.io/exemplo/foto.jpg');
    });

    it('entrega null quando nao tem, e nao omite o campo', async () => {
      /**
       * O mapa distingue "sem foto" de "campo ausente": sem foto ele desenha as
       * iniciais. Se o campo sumisse do payload, o TypeScript nao acusaria em
       * tempo de execucao e o marcador ficaria vazio.
       */
      motoboyOnline(null);

      const resultado = await service.overview(admin, {});

      expect(resultado.onlineDrivers[0]).toHaveProperty('avatarUrl', null);
    });
  });

  describe('fila de despacho', () => {
    it('entrega a Home na mesma ordem usada pelo proximo despacho', async () => {
      livePresenceService.listActive.mockResolvedValue([
        {
          driverId: 'driver-1',
          lat: -20.15,
          lng: -41.62,
          capturedAt: '2026-08-23T15:59:00.000Z',
          accuracy: 10,
          appVersion: '1.0.0',
        },
        {
          driverId: 'driver-2',
          lat: -20.16,
          lng: -41.63,
          capturedAt: '2026-08-23T15:59:00.000Z',
          accuracy: 10,
          appVersion: '1.0.0',
        },
      ]);
      prisma.driver.findMany.mockResolvedValue([
        {
          id: 'driver-1',
          user: { name: 'Primeiro antigo', phone: '1', avatarUrl: null },
          presenceLogs: [{ wentOnlineAt: new Date('2026-08-23T14:00:00.000Z') }],
          serviceTypes: [],
          deliveries: [],
        },
        {
          id: 'driver-2',
          user: { name: 'Prioridade manual', phone: '2', avatarUrl: null },
          presenceLogs: [{ wentOnlineAt: new Date('2026-08-23T15:00:00.000Z') }],
          serviceTypes: [],
          deliveries: [],
        },
      ]);
      livePresenceService.orderForDispatch.mockResolvedValue(['driver-2', 'driver-1']);

      const result = await service.overview(admin, {});

      expect(result.onlineDrivers.map((driver) => [driver.id, driver.queuePosition])).toEqual([
        ['driver-2', 1],
        ['driver-1', 2],
      ]);
    });

    it('salva a ordem e preserva no fim quem entrou enquanto o admin editava', async () => {
      livePresenceService.listActive.mockResolvedValue([
        { driverId: 'driver-1' },
        { driverId: 'driver-2' },
        { driverId: 'driver-new' },
      ]);
      livePresenceService.orderForDispatch.mockResolvedValue([
        'driver-1',
        'driver-2',
        'driver-new',
      ]);

      const result = await service.reorderDispatchQueue(admin, {
        driverIds: ['driver-2', 'driver-1'],
      });

      expect(livePresenceService.replaceDispatchOrder).toHaveBeenCalledWith([
        'driver-2',
        'driver-1',
        'driver-new',
      ]);
      expect(result.driverIds).toEqual(['driver-2', 'driver-1', 'driver-new']);
      expect(realtimeGateway.emitDispatchQueueUpdated).toHaveBeenCalled();
    });

    it('recusa uma edicao baseada em motoboy que ja ficou offline', async () => {
      livePresenceService.listActive.mockResolvedValue([{ driverId: 'driver-1' }]);

      await expect(
        service.reorderDispatchQueue(admin, { driverIds: ['driver-1', 'driver-offline'] }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(livePresenceService.replaceDispatchOrder).not.toHaveBeenCalled();
    });
  });

  describe('atividade auditavel', () => {
    it('mostra pedido, empresa e o motoboy que coletou', async () => {
      prisma.deliveryStatusHistory.findMany.mockResolvedValue([
        {
          id: 'history-1',
          fromStatus: 'ACCEPTED',
          toStatus: 'COLLECTED',
          changedAt: new Date('2026-08-23T15:59:00.000Z'),
          changedByUser: {
            name: 'Maicon Douglas',
            type: 'DRIVER',
            driver: { id: 'driver-1' },
          },
          delivery: {
            id: 'delivery-1',
            displayNumber: 12,
            companyId: 'company-1',
            status: 'COLLECTED',
            company: { tradeName: 'Drogaria Nova Farma' },
            driver: {
              id: 'driver-1',
              user: { name: 'Maicon Douglas' },
            },
          },
        },
      ]);

      const [event] = await service.activity({ limit: 20 });

      expect(event).toEqual(
        expect.objectContaining({
          message: 'Pedido #12 da empresa Drogaria Nova Farma foi coletado por Maicon Douglas.',
          companyName: 'Drogaria Nova Farma',
          driverId: 'driver-1',
          driverName: 'Maicon Douglas',
        }),
      );
    });

    it('mostra empresa e motoboy na resposta da oferta', async () => {
      prisma.deliveryOffer.findMany.mockResolvedValue([
        {
          id: 'offer-1',
          response: 'ACCEPTED',
          offeredAt: new Date('2026-08-23T15:58:00.000Z'),
          respondedAt: new Date('2026-08-23T15:59:00.000Z'),
          driverId: 'driver-1',
          delivery: {
            id: 'delivery-1',
            displayNumber: 12,
            companyId: 'company-1',
            company: { tradeName: 'Drogaria Nova Farma' },
          },
          driver: { user: { name: 'Maicon Douglas' } },
        },
      ]);

      const [event] = await service.activity({ limit: 20 });

      expect(event).toEqual(
        expect.objectContaining({
          message:
            'Oferta do pedido #12 da empresa Drogaria Nova Farma foi aceita por Maicon Douglas.',
          companyName: 'Drogaria Nova Farma',
          driverName: 'Maicon Douglas',
        }),
      );
    });
  });
});
