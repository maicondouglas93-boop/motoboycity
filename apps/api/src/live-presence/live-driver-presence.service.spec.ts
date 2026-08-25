const mockRedis = {
  connect: jest.fn(),
  quit: jest.fn(),
  get: jest.fn(),
  zrange: jest.fn(),
  zrevrange: jest.fn(),
  zadd: jest.fn(),
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
    emitDispatchQueueUpdated: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.zrange.mockResolvedValue([]);
    mockRedis.zrevrange.mockResolvedValue([]);
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.zrem.mockResolvedValue(1);
    mockRedis.multi.mockImplementation(() => {
      const transaction = {
        del: jest.fn(),
        set: jest.fn(),
        zadd: jest.fn(),
        zrem: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      };
      transaction.del.mockReturnValue(transaction);
      transaction.set.mockReturnValue(transaction);
      transaction.zadd.mockReturnValue(transaction);
      transaction.zrem.mockReturnValue(transaction);
      return transaction;
    });
    prisma = {
      driver: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'driver-1', user: { name: 'Motoboy Teste' } }]),
        updateMany: jest.fn(),
      },
      driverPresenceLog: { updateMany: jest.fn() },
    };
    realtime = {
      emitDriverPresence: jest.fn(),
      emitToDriver: jest.fn(),
      emitAdminActivity: jest.fn(),
      emitDispatchQueueUpdated: jest.fn(),
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

  it('preserva a ordem manual e anexa novos motoboys no fim', async () => {
    mockRedis.zrange.mockResolvedValue(['driver-2', 'driver-offline']);
    mockRedis.zrevrange.mockResolvedValue(['driver-2', '4']);
    const service = new LiveDriverPresenceService(prisma as never, realtime as never);

    await expect(service.orderForDispatch(['driver-1', 'driver-2', 'driver-3'])).resolves.toEqual([
      'driver-2',
      'driver-1',
      'driver-3',
    ]);

    const transaction = mockRedis.multi.mock.results.at(-1)?.value;
    expect(transaction.zadd).toHaveBeenNthCalledWith(
      1,
      'motoboycity:driver-dispatch-order',
      5,
      'driver-1',
    );
    expect(transaction.zadd).toHaveBeenNthCalledWith(
      2,
      'motoboycity:driver-dispatch-order',
      6,
      'driver-3',
    );
  });

  it('move para o fim e avisa os paineis admin quando a vez e consumida', async () => {
    const service = new LiveDriverPresenceService(prisma as never, realtime as never);

    await service.moveToDispatchTail('driver-1');

    expect(mockRedis.zadd).toHaveBeenCalledWith(
      'motoboycity:driver-dispatch-order',
      expect.any(Number),
      'driver-1',
    );
    expect(realtime.emitDispatchQueueUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ driverId: 'driver-1' }),
    );
  });
});
