import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { LiveDriverPresenceService } from '../live-presence/live-driver-presence.service';
import { DriverPresenceService } from './driver-presence.service';

const driverUser = { id: 'user-1', type: 'DRIVER', passwordHash: 'hash-current' } as User;
const companyUser = { id: 'user-2', type: 'COMPANY_MEMBER' } as User;
const availablePayload = {
  availability: 'AVAILABLE' as const,
  location: { lat: -23.5, lng: -46.6, accuracy: 12 },
  appVersion: '1.0.0',
  trackingCapability: 'BACKGROUND_V1' as const,
};

describe('DriverPresenceService', () => {
  let service: DriverPresenceService;
  let prisma: {
    driver: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    driverPresenceLog: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let dispatchService: { dispatchAvailableDeliveries: jest.Mock };
  let realtimeGateway: {
    emitAdminActivity: jest.Mock;
    emitDriverPresence: jest.Mock;
    emitDriverLocation: jest.Mock;
  };
  let livePresence: {
    isLive: jest.Mock;
    upsert: jest.Mock;
    remove: jest.Mock;
    reconcileExpired: jest.Mock;
  };
  let tx: {
    driver: { updateMany: jest.Mock };
    driverPresenceLog: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      driver: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      driverPresenceLog: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    };
    prisma = {
      driver: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      driverPresenceLog: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (input: unknown) =>
          typeof input === 'function'
            ? (input as (tx: unknown) => unknown)(tx)
            : Promise.all(input as Promise<unknown>[]),
        ),
    };
    dispatchService = { dispatchAvailableDeliveries: jest.fn().mockResolvedValue(undefined) };
    realtimeGateway = {
      emitAdminActivity: jest.fn(),
      emitDriverPresence: jest.fn(),
      emitDriverLocation: jest.fn(),
    };
    livePresence = {
      isLive: jest.fn().mockResolvedValue(true),
      upsert: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      reconcileExpired: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverPresenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: DispatchService, useValue: dispatchService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: LiveDriverPresenceService, useValue: livePresence },
      ],
    }).compile();

    service = module.get(DriverPresenceService);
  });

  describe('get', () => {
    it('rejeita usuário que não é motoboy', async () => {
      await expect(service.get(companyUser)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita quando não existe Driver pro usuário', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.get(driverUser)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('retorna since=null quando UNAVAILABLE', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'UNAVAILABLE' });

      const result = await service.get(driverUser);

      expect(result).toEqual({ availability: 'UNAVAILABLE', since: null });
    });

    it('retorna o wentOnlineAt do presence log aberto quando AVAILABLE', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', availability: 'AVAILABLE' });
      prisma.driverPresenceLog.findFirst.mockResolvedValue({
        wentOnlineAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const result = await service.get(driverUser);

      expect(result).toEqual({ availability: 'AVAILABLE', since: '2026-01-01T10:00:00.000Z' });
    });
  });

  describe('setAvailability', () => {
    it('rejeita ficar disponível se o motoboy não está APPROVED', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'UNAVAILABLE',
        approvalStatus: 'PENDING',
        accountStatus: 'ACTIVE',
      });

      await expect(service.setAvailability(driverUser, availablePayload)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejeita ficar disponível se a conta não está ACTIVE', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'UNAVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'SUSPENDED',
      });

      await expect(service.setAvailability(driverUser, availablePayload)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('renova a presença quando já está disponível', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });

      tx.driverPresenceLog.findFirst.mockResolvedValue({ id: 'log-1' });
      prisma.driverPresenceLog.findFirst.mockResolvedValue({ wentOnlineAt: new Date() });

      await service.setAvailability(driverUser, availablePayload);

      expect(livePresence.upsert).toHaveBeenCalled();
      expect(tx.driverPresenceLog.create).not.toHaveBeenCalled();
    });

    it('fica disponível: atualiza Driver, cria presence log e dispara o scan de despacho', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'UNAVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
        userId: 'user-1',
      });
      tx.driverPresenceLog.findFirst.mockResolvedValue(null);
      prisma.driverPresenceLog.findFirst.mockResolvedValue({
        wentOnlineAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const result = await service.setAvailability(driverUser, availablePayload);

      expect(tx.driver.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
          user: { id: 'user-1', passwordHash: 'hash-current' },
        },
        data: expect.objectContaining({
          availability: 'AVAILABLE',
          lastKnownLat: -23.5,
          lastKnownLng: -46.6,
          appVersion: '1.0.0',
        }),
      });
      expect(tx.driverPresenceLog.create).toHaveBeenCalledWith({
        data: { driverId: 'driver-1', wentOnlineAt: expect.any(Date) },
      });
      expect(dispatchService.dispatchAvailableDeliveries).toHaveBeenCalled();
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'DRIVER_ONLINE' }),
      );
      expect(result.availability).toBe('AVAILABLE');
    });

    it('não religa o motoboy quando a senha muda durante a requisição', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'UNAVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      tx.driver.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.setAvailability(driverUser, availablePayload)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(livePresence.remove).toHaveBeenCalledWith('driver-1');
      expect(dispatchService.dispatchAvailableDeliveries).not.toHaveBeenCalled();
    });

    it('fica indisponível: fecha o presence log e NÃO dispara o scan de despacho', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
        userId: 'user-1',
      });

      const result = await service.setAvailability(driverUser, { availability: 'UNAVAILABLE' });

      expect(prisma.driverPresenceLog.updateMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1', wentOfflineAt: null },
        data: { wentOfflineAt: expect.any(Date) },
      });
      expect(dispatchService.dispatchAvailableDeliveries).not.toHaveBeenCalled();
      expect(result).toEqual({ availability: 'UNAVAILABLE', since: null });
    });
  });

  describe('heartbeat', () => {
    it('renova o TTL, atualiza o cache do Driver e emite GPS somente para admin', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        userId: 'user-1',
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      prisma.driverPresenceLog.findFirst.mockResolvedValue({
        wentOnlineAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const result = await service.heartbeat(driverUser, {
        lat: -20.154,
        lng: -41.623,
        accuracy: 9,
        appVersion: '1.0.1',
      });

      expect(livePresence.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: 'driver-1',
          lat: -20.154,
          lng: -41.623,
          appVersion: '1.0.1',
        }),
      );
      expect(prisma.driver.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
          user: { id: 'user-1', passwordHash: 'hash-current' },
        },
        data: expect.objectContaining({ lastKnownLat: -20.154, lastKnownLng: -41.623 }),
      });
      expect(realtimeGateway.emitDriverLocation).toHaveBeenCalledWith(
        expect.objectContaining({ driverId: 'driver-1', accuracy: 9 }),
      );
      expect(result).toEqual({
        availability: 'AVAILABLE',
        since: '2026-01-01T10:00:00.000Z',
      });
    });

    it('rejeita heartbeat depois de ficar offline', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'UNAVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });

      await expect(
        service.heartbeat(driverUser, {
          lat: -20.154,
          lng: -41.623,
          appVersion: '1.0.1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(livePresence.upsert).not.toHaveBeenCalled();
    });

    it('remove o heartbeat quando a senha muda antes da gravação', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      prisma.driver.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.heartbeat(driverUser, {
          lat: -20.154,
          lng: -41.623,
          appVersion: '1.0.1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(livePresence.remove).toHaveBeenCalledWith('driver-1');
      expect(realtimeGateway.emitDriverLocation).not.toHaveBeenCalled();
    });
  });
});
