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
});
