import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPricingTablesService } from './admin-pricing-tables.service';

describe('AdminPricingTablesService', () => {
  let service: AdminPricingTablesService;
  let tx: {
    pricingTable: { updateMany: jest.Mock; create: jest.Mock };
  };
  let prisma: {
    serviceType: { findUnique: jest.Mock };
    region: { findFirst: jest.Mock };
    pricingTable: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    tx = {
      pricingTable: { updateMany: jest.fn(), create: jest.fn() },
    };
    prisma = {
      serviceType: { findUnique: jest.fn() },
      region: { findFirst: jest.fn() },
      pricingTable: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminPricingTablesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminPricingTablesService);
  });

  describe('list', () => {
    it('mapeia tabelas de preço, convertendo Decimal para number', async () => {
      prisma.pricingTable.findMany.mockResolvedValue([
        {
          id: 'pt-1',
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          serviceType: { name: 'Moto' },
          baseFee: { toString: () => '5.00' },
          perKmFee: { toString: () => '1.50' },
          minimumFee: { toString: () => '8.00' },
          returnFee: { toString: () => '3.00' },
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.list({});

      expect(result).toEqual([
        {
          id: 'pt-1',
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          serviceTypeName: 'Moto',
          baseFee: 5,
          perKmFee: 1.5,
          minimumFee: 8,
          returnFee: 3,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('mapeia minimumFee/returnFee null corretamente', async () => {
      prisma.pricingTable.findMany.mockResolvedValue([
        {
          id: 'pt-1',
          regionId: 'region-1',
          serviceTypeId: 'st-1',
          serviceType: { name: 'Moto' },
          baseFee: { toString: () => '5.00' },
          perKmFee: { toString: () => '1.50' },
          minimumFee: null,
          returnFee: null,
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.list({});

      expect(result[0]?.minimumFee).toBeNull();
      expect(result[0]?.returnFee).toBeNull();
    });

    it('repassa filtros serviceTypeId e active para a query', async () => {
      prisma.pricingTable.findMany.mockResolvedValue([]);

      await service.list({ serviceTypeId: 'st-1', active: true });

      expect(prisma.pricingTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { serviceTypeId: 'st-1', active: true } }),
      );
    });
  });

  describe('create', () => {
    const payload = { serviceTypeId: 'st-1', baseFee: 5, perKmFee: 1.5, minimumFee: 8, returnFee: 3 };

    it('cria uma nova tabela de preços e desativa a anterior da mesma região+serviço', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1', name: 'Moto' });
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      tx.pricingTable.create.mockResolvedValue({
        id: 'pt-2',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        serviceType: { name: 'Moto' },
        baseFee: { toString: () => '5.00' },
        perKmFee: { toString: () => '1.50' },
        minimumFee: { toString: () => '8.00' },
        returnFee: { toString: () => '3.00' },
        active: true,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.create(payload);

      expect(tx.pricingTable.updateMany).toHaveBeenCalledWith({
        where: { regionId: 'region-1', serviceTypeId: 'st-1', active: true },
        data: { active: false },
      });
      expect(tx.pricingTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            regionId: 'region-1',
            serviceTypeId: 'st-1',
            baseFee: 5,
            perKmFee: 1.5,
            minimumFee: 8,
            returnFee: 3,
          }),
        }),
      );
      expect(result.id).toBe('pt-2');
      expect(result.active).toBe(true);
    });

    it('rejeita quando o tipo de serviço não existe', async () => {
      prisma.serviceType.findUnique.mockResolvedValue(null);

      await expect(service.create(payload)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita quando não há região configurada', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1' });
      prisma.region.findFirst.mockResolvedValue(null);

      await expect(service.create(payload)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('deactivate', () => {
    it('desativa uma tabela de preços ativa', async () => {
      prisma.pricingTable.findUnique.mockResolvedValue({ id: 'pt-1', active: true });
      prisma.pricingTable.update.mockResolvedValue({
        id: 'pt-1',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        serviceType: { name: 'Moto' },
        baseFee: { toString: () => '5.00' },
        perKmFee: { toString: () => '1.50' },
        minimumFee: null,
        returnFee: null,
        active: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.deactivate('pt-1');

      expect(result.active).toBe(false);
    });

    it('rejeita desativar uma tabela já inativa', async () => {
      prisma.pricingTable.findUnique.mockResolvedValue({ id: 'pt-1', active: false });

      await expect(service.deactivate('pt-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.pricingTable.update).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a tabela não existe', async () => {
      prisma.pricingTable.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
