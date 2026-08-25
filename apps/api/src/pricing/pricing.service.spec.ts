import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: {
    region: { findFirst: jest.Mock };
    pricingTable: { findFirst: jest.Mock };
    surcharge: { findMany: jest.Mock };
  };
  let platformSettingsService: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      region: { findFirst: jest.fn() },
      pricingTable: { findFirst: jest.fn() },
      // Sem taxa adicional configurada, que e o estado padrao da operacao.
      surcharge: { findMany: jest.fn().mockResolvedValue([]) },
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

  const input = {
    companyId: 'company-1',
    regionId: 'region-1',
    serviceTypeId: 'st-1',
    distanceKm: 5,
    requiresReturn: false,
  };

  it('calcula o preço usando a tabela ativa e a comissão configurada', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: 'company-1',
      driverCommissionPercentage: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    const result = await service.quote(input);

    expect(prisma.pricingTable.findFirst).toHaveBeenCalledWith({
      where: {
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        companyId: 'company-1',
        active: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result.totalValue).toBe(12.5);
  });

  it('usa a divisão personalizada da empresa sem consultar a divisão global', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: 'company-1',
      driverCommissionPercentage: { toString: () => '70.00' } as unknown as number,
    });

    const result = await service.quote(input);

    expect(platformSettingsService.get).not.toHaveBeenCalled();
    expect(result.totalValue).toBe(12.5);
    expect(result.driverValue).toBe(8.75);
    expect(result.platformValue).toBe(3.75);
  });

  it('mantém o fallback global para uma tabela personalizada antiga sem divisão própria', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: 'company-1',
      driverCommissionPercentage: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    const result = await service.quote(input);

    expect(platformSettingsService.get).toHaveBeenCalledTimes(1);
    expect(result.driverValue).toBe(10);
    expect(result.platformValue).toBe(2.5);
  });

  // A cotação passou a exigir a região da empresa (P1-06). Antes ela escolhia sozinha a
  // primeira região ativa: com duas praças, uma empresa seria cobrada pela tabela da
  // outra, sem erro nenhum aparecendo.
  it('cota pela região informada, e não pela primeira região ativa do banco', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-2' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: 'company-1',
      driverCommissionPercentage: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    await service.quote({ ...input, regionId: 'region-2' });

    expect(prisma.region.findFirst).toHaveBeenCalledWith({
      where: { id: 'region-2', active: true },
    });
    expect(prisma.pricingTable.findFirst).toHaveBeenCalledWith({
      where: {
        regionId: 'region-2',
        serviceTypeId: 'st-1',
        companyId: 'company-1',
        active: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('usa a tabela geral quando a empresa não tem preço personalizado', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      baseFee: { toString: () => '6' } as unknown as number,
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '2' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: null,
      driverCommissionPercentage: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    const result = await service.quote(input);

    expect(prisma.pricingTable.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        companyId: null,
        active: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result.totalValue).toBe(16);
  });

  it('rejeita quando a região da empresa não existe ou está inativa', async () => {
    prisma.region.findFirst.mockResolvedValue(null);

    await expect(service.quote(input)).rejects.toBeInstanceOf(ConflictException);
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
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: 'company-1',
      driverCommissionPercentage: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: null });

    await expect(service.quote(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('distância zero: repassa para o motor de cálculo sem erro', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    prisma.pricingTable.findFirst.mockResolvedValue({
      baseFee: { toString: () => '5' } as unknown as number,
      includedDistanceKm: { toString: () => '0' } as unknown as number,
      perKmFee: { toString: () => '1.5' } as unknown as number,
      minimumFee: null,
      returnFee: null,
      companyId: 'company-1',
      driverCommissionPercentage: null,
    });
    platformSettingsService.get.mockResolvedValue({ driverCommissionPercentage: 80 });

    const result = await service.quote({ ...input, distanceKm: 0 });

    expect(result.subtotal).toBe(5);
  });
});
