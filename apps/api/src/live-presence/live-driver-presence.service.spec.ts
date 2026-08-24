const mockRedis = {
  connect: jest.fn(),
  quit: jest.fn(),
  get: jest.fn(),
  zrem: jest.fn(),
  multi: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedis),
}));

import { LiveDriverPresenceService } from './live-driver-presence.service';

describe('LiveDriverPresenceService', () => {
  let prisma: {
    driver: { findMany: jest.Mock; updateMany: jest.Mock };
    driverPresenceLog: { updateMany: jest.Mock };
  };
  let realtime: {
    emitDriverPresence: jest.Mock;
    emitToDriver: jest.Mock;
    emitAdminActivity: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.zrem.mockResolvedValue(1);
    mockRedis.multi.mockReturnValue({
      del: jest.fn().mockReturnThis(),
      zrem: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });
    prisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'driver-1', user: { name: 'Motoboy Teste' } },
        ]),
        updateMany: jest.fn(),
      },
      driverPresenceLog: { updateMany: jest.fn() },
    };
    realtime = {
      emitDriverPresence: jest.fn(),
      emitToDriver: jest.fn(),
      emitAdminActivity: jest.fn(),
    };
  });

  it('não expira a presença se um heartbeat venceu a corrida antes do update', async () => {
    prisma.driver.updateMany.mockResolvedValue({ count: 0 });
    const service = new LiveDriverPresenceService(prisma as never, realtime as never);

    await expect(service.reconcileExpired()).resolves.toBe(0);

    expect(prisma.driver.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'driver-1',
        availability: 'AVAILABLE',
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: expect.any(Date) } }],
      },
      data: { availability: 'UNAVAILABLE' },
    });
    expect(prisma.driverPresenceLog.updateMany).not.toHaveBeenCalled();
    expect(realtime.emitToDriver).not.toHaveBeenCalled();
  });

  it('avisa o app quando a presença continua realmente vencida', async () => {
    prisma.driver.updateMany.mockResolvedValue({ count: 1 });
    const service = new LiveDriverPresenceService(prisma as never, realtime as never);

    await expect(service.reconcileExpired()).resolves.toBe(1);

    expect(realtime.emitToDriver).toHaveBeenCalledWith(
      'driver-1',
      'driver:presence-expired',
      expect.objectContaining({ reason: 'HEARTBEAT_EXPIRED' }),
    );
  });
});
