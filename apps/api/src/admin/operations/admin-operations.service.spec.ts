import { Test, type TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LocationSilenceService } from '../../tracking/location-silence.service';
import { AdminOperationsService } from './admin-operations.service';

describe('AdminOperationsService', () => {
  let service: AdminOperationsService;
  const admin = { id: 'admin-1', type: 'ADMIN' } as User;
  const prisma = { driver: { findMany: jest.fn() } };
  const deliveriesService = { operations: jest.fn() };
  const livePresenceService = { listActive: jest.fn() };
  const locationSilenceService = { listSilentDrivers: jest.fn() };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T16:00:00.000Z'));
    jest.clearAllMocks();
    deliveriesService.operations.mockResolvedValue({
      active: [],
      recent: [],
      counts: { COMPLETED: 12, CANCELLED: 4 },
    });
    livePresenceService.listActive.mockResolvedValue([]);
    prisma.driver.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOperationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: DeliveriesService, useValue: deliveriesService },
        { provide: LiveDriverPresenceService, useValue: livePresenceService },
        { provide: LocationSilenceService, useValue: locationSilenceService },
      ],
    }).compile();

    service = module.get(AdminOperationsService);
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

      expect(resultado.onlineDrivers[0]?.avatarUrl).toBe(
        'https://ik.imagekit.io/exemplo/foto.jpg',
      );
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
});
