import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDriversService } from './admin-drivers.service';

describe('AdminDriversService', () => {
  let service: AdminDriversService;
  let prisma: {
    driver: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    serviceType: { findMany: jest.Mock };
    driverServiceType: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      driver: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      serviceType: { findMany: jest.fn() },
      driverServiceType: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminDriversService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminDriversService);
  });

  describe('list', () => {
    it('mapeia motoboys para o formato de listagem, incluindo quem revisou', async () => {
      prisma.driver.findMany.mockResolvedValue([
        {
          id: 'driver-1',
          cpf: '11122233344',
          approvalStatus: 'PENDING',
          accountStatus: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { name: 'Motoboy Um', email: 'motoboy1@example.com', phone: '33999990000' },
          reviewedBy: null,
          reviewedAt: null,
          serviceTypes: [],
        },
        {
          id: 'driver-2',
          cpf: '55566677788',
          approvalStatus: 'APPROVED',
          accountStatus: 'SUSPENDED',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          user: { name: 'Motoboy Dois', email: 'motoboy2@example.com', phone: '33999991111' },
          reviewedBy: { id: 'admin-1', name: 'Admin Um' },
          reviewedAt: new Date('2026-01-02T12:00:00.000Z'),
          serviceTypes: [
            {
              isPrimary: true,
              serviceType: { id: 'service-1', code: 'MOTO', name: 'Moto' },
            },
          ],
        },
      ]);

      const result = await service.list({});

      expect(result).toEqual([
        {
          id: 'driver-1',
          name: 'Motoboy Um',
          email: 'motoboy1@example.com',
          phone: '33999990000',
          cpf: '11122233344',
          approvalStatus: 'PENDING',
          accountStatus: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          reviewedBy: null,
          reviewedAt: null,
          serviceTypes: [],
        },
        {
          id: 'driver-2',
          name: 'Motoboy Dois',
          email: 'motoboy2@example.com',
          phone: '33999991111',
          cpf: '55566677788',
          approvalStatus: 'APPROVED',
          accountStatus: 'SUSPENDED',
          createdAt: '2026-01-02T00:00:00.000Z',
          reviewedBy: { id: 'admin-1', name: 'Admin Um' },
          reviewedAt: '2026-01-02T12:00:00.000Z',
          serviceTypes: [{ id: 'service-1', code: 'MOTO', name: 'Moto', isPrimary: true }],
        },
      ]);
    });

    it('repassa os filtros de status para a query do Prisma', async () => {
      prisma.driver.findMany.mockResolvedValue([]);

      await service.list({ approvalStatus: 'PENDING', accountStatus: 'ACTIVE' });

      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { approvalStatus: 'PENDING', accountStatus: 'ACTIVE' },
        }),
      );
    });
  });

  describe('approve', () => {
    it('aprova um motoboy PENDING, gravando quem revisou', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'PENDING' });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', approvalStatus: 'APPROVED' });

      const result = await service.approve('driver-1', 'admin-1');

      expect(result).toEqual({
        driverId: 'driver-1',
        approvalStatus: 'APPROVED',
        reviewedByUserId: 'admin-1',
        reviewedAt: expect.any(String),
      });
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          approvalStatus: 'APPROVED',
          reviewedByUserId: 'admin-1',
          reviewedAt: expect.any(Date),
        },
      });
    });

    it('rejeita aprovar um motoboy que não está PENDING', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'APPROVED' });

      await expect(service.approve('driver-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('retorna 404 quando o motoboy não existe', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.approve('inexistente', 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reject', () => {
    it('rejeita um motoboy PENDING, gravando quem revisou', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'PENDING' });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', approvalStatus: 'REJECTED' });

      const result = await service.reject('driver-1', 'admin-1');

      expect(result.approvalStatus).toBe('REJECTED');
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          approvalStatus: 'REJECTED',
          reviewedByUserId: 'admin-1',
          reviewedAt: expect.any(Date),
        },
      });
    });

    it('rejeita a ação quando o motoboy não está PENDING', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'REJECTED' });

      await expect(service.reject('driver-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('suspend / block / reactivate', () => {
    it('suspende um motoboy APPROVED e ACTIVE', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'SUSPENDED' });

      const result = await service.suspend('driver-1');

      expect(result).toEqual({ driverId: 'driver-1', accountStatus: 'SUSPENDED' });
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { accountStatus: 'SUSPENDED' },
      });
    });

    it('bloqueia um motoboy APPROVED mesmo que já esteja SUSPENDED', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'SUSPENDED',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'BLOCKED' });

      const result = await service.block('driver-1');

      expect(result).toEqual({ driverId: 'driver-1', accountStatus: 'BLOCKED' });
    });

    it('rejeita suspender um motoboy que ainda não foi aprovado', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'PENDING',
        accountStatus: 'ACTIVE',
      });

      await expect(service.suspend('driver-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('rejeita suspender um motoboy que já está SUSPENDED', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'SUSPENDED',
      });

      await expect(service.suspend('driver-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('reativa um motoboy BLOCKED de volta para ACTIVE', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'BLOCKED',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'ACTIVE' });

      const result = await service.reactivate('driver-1');

      expect(result).toEqual({ driverId: 'driver-1', accountStatus: 'ACTIVE' });
    });
  });

  describe('replaceServiceTypes', () => {
    it('substitui as modalidades de forma atômica e preserva a ordem escolhida', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.serviceType.findMany.mockResolvedValue([
        { id: 'service-1', code: 'MOTO', name: 'Moto' },
        { id: 'service-2', code: 'CARRO', name: 'Carro' },
      ]);

      const result = await service.replaceServiceTypes('driver-1', {
        serviceTypeIds: ['service-2', 'service-1'],
      });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(prisma.driverServiceType.deleteMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1' },
      });
      expect(prisma.driverServiceType.createMany).toHaveBeenCalledWith({
        data: [
          { driverId: 'driver-1', serviceTypeId: 'service-2', isPrimary: true },
          { driverId: 'driver-1', serviceTypeId: 'service-1', isPrimary: false },
        ],
      });
      expect(result).toEqual({
        driverId: 'driver-1',
        serviceTypes: [
          { id: 'service-2', code: 'CARRO', name: 'Carro', isPrimary: true },
          { id: 'service-1', code: 'MOTO', name: 'Moto', isPrimary: false },
        ],
      });
    });

    it('rejeita a substituição se qualquer modalidade não existe ou está inativa', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.serviceType.findMany.mockResolvedValue([
        { id: 'service-1', code: 'MOTO', name: 'Moto' },
      ]);

      await expect(
        service.replaceServiceTypes('driver-1', {
          serviceTypeIds: ['service-1', 'service-inactive'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.driverServiceType.deleteMany).not.toHaveBeenCalled();
      expect(prisma.driverServiceType.createMany).not.toHaveBeenCalled();
    });

    it('retorna 404 sem alterar as modalidades quando o motoboy não existe', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.replaceServiceTypes('missing', { serviceTypeIds: ['service-1'] }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.driverServiceType.deleteMany).not.toHaveBeenCalled();
    });
  });
});
