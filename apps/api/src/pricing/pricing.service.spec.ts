import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: {
    region: { findFirst: jest.Mock };
    pricingTable: { findFirst: jest.Mock };
  };
  let platformSettingsService: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      region: { findFirst: jest.fn() },
      pricingTable: { findFirst: jest.fn() },
    };
    platformSettingsService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
      ],
    }).compile();

    service = module.get(PricingService);
  });

  const input = { serviceTypeId: 'st-1', distanceKm: 5, requiresReturn: false };

  it('calcula o preço usando a tabela ativa e a comissão configurada', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    const result = await service.quote(input);

    expect(prisma.pricingTable.findFirst).toHaveBeenCalledWith({
      where: { regionId: 'region-1', serviceTypeId: 'st-1', active: true },
    });
    expect(result.totalValue).toBe(12.5);
  });

  it('rejeita quando não há região configurada', async () => {
    prisma.region.findFirst.mockResolvedValue(null);

    await expect(service.quote(input)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('rejeita quando não há tabela de preços ativa pro tipo de serviço (tarifa não configurada)', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue(null);

    await expect(service.quote(input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita quando a comissão entregador/plataforma ainda não foi configurada', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: null });

    await expect(service.quote(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('distância zero: repassa para o motor de cálculo sem erro', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    const result = await service.quote({ ...input, distanceKm: 0 });

    expect(result.subtotal).toBe(5);
  });
});
