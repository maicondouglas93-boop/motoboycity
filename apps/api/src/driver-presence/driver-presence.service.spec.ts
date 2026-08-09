import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { DriverPresenceService } from './driver-presence.service';

const driverUser = { id: 'user-1', type: 'DRIVER' } as User;
const companyUser = { id: 'user-2', type: 'COMPANY_MEMBER' } as User;

describe('DriverPresenceService', () => {
  let service: DriverPresenceService;
  let prisma: {
    driver: { findUnique: jest.Mock; update: jest.Mock };
    driverPresenceLog: { findFirst: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let dispatchService: { dispatchAvailableDeliveries: jest.Mock };
  let realtimeGateway: { emitAdminActivity: jest.Mock };
  let tx: {
    driver: { update: jest.Mock };
    driverPresenceLog: { create: jest.Mock; updateMany: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      driver: { update: jest.fn() },
      driverPresenceLog: { create: jest.fn(), updateMany: jest.fn() },
    };
    prisma = {
      driver: { findUnique: jest.fn(), update: jest.fn() },
      driverPresenceLog: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    dispatchService = { dispatchAvailableDeliveries: jest.fn().mockResolvedValue(undefined) };
    realtimeGateway = { emitAdminActivity: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverPresenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: DispatchService, useValue: dispatchService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
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

      await expect(service.setAvailability(driverUser, 'AVAILABLE')).rejects.toBeInstanceOf(
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

      await expect(service.setAvailability(driverUser, 'AVAILABLE')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejeita quando já está no status pedido (idempotência)', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });

      await expect(service.setAvailability(driverUser, 'AVAILABLE')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('fica disponível: atualiza Driver, cria presence log e dispara o scan de despacho', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'UNAVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      prisma.driverPresenceLog.findFirst.mockResolvedValue({
        wentOnlineAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const result = await service.setAvailability(driverUser, 'AVAILABLE');

      expect(tx.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { availability: 'AVAILABLE' },
      });
      expect(tx.driverPresenceLog.create).toHaveBeenCalledWith({
        data: { driverId: 'driver-1', wentOnlineAt: expect.any(Date) },
      });
      expect(dispatchService.dispatchAvailableDeliveries).toHaveBeenCalled();
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalledWith(
        expect.stringContaining('online'),
      );
      expect(result.availability).toBe('AVAILABLE');
    });

    it('fica indisponível: fecha o presence log e NÃO dispara o scan de despacho', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        availability: 'AVAILABLE',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });

      const result = await service.setAvailability(driverUser, 'UNAVAILABLE');

      expect(tx.driverPresenceLog.updateMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1', wentOfflineAt: null },
        data: { wentOfflineAt: expect.any(Date) },
      });
      expect(dispatchService.dispatchAvailableDeliveries).not.toHaveBeenCalled();
      expect(result).toEqual({ availability: 'UNAVAILABLE', since: null });
    });
  });
});
