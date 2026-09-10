import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { RainWeatherService } from '../weather/rain-weather.service';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: {
    region: { findFirst: jest.Mock };
    pricingTable: { findFirst: jest.Mock };
    surcharge: { findMany: jest.Mock };
  };
  let platformSettingsService: { get: jest.Mock };
  let rainWeather: { forSurcharge: jest.Mock };

  beforeEach(async () => {
    prisma = {
      region: { findFirst: jest.fn() },
      pricingTable: { findFirst: jest.fn() },
      // Sem taxa adicional configurada, que e o estado padrao da operacao.
      surcharge: { findMany: jest.fn().mockResolvedValue([]) },
    };
    platformSettingsService = { get: jest.fn() };
    rainWeather = { forSurcharge: jest.fn().mockReturnValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
        { provide: RainWeatherService, useValue: rainWeather },
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

  describe('taxa automática de chuva', () => {
    beforeEach(() => {
      prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
      prisma.pricingTable.findFirst.mockResolvedValue({
        companyId: 'company-1',
        driverCommissionPercentage: 80,
        baseFee: 5,
        includedDistanceKm: 0,
        perKmFee: 1.5,
        minimumFee: null,
        returnFee: null,
      });
      prisma.surcharge.findMany.mockResolvedValue([
        {
          id: 'rain-1',
          name: 'Chuva',
          type: 'FIXED',
          value: 3,
          driverSharePercentage: 100,
          active: true,
          manuallyActive: false,
          schedules: [],
        },
      ]);
    });

    it('aplica a taxa existente e preserva a soma entre entregador e plataforma', async () => {
      rainWeather.forSurcharge.mockReturnValue({ activeNow: true });
      const result = await service.quote(input);
      expect(result.totalValue).toBe(15.5);
      expect(result.surchargeValue).toBe(3);
      expect(result.surchargeLabel).toBe('Chuva');
      expect(result.driverValue).toBe(13);
      expect(result.platformValue).toBe(2.5);
      expect(result.driverValue + result.platformValue).toBe(result.totalValue);
      expect(prisma.surcharge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { regionId: 'region-1', active: true },
        }),
      );
    });

    it('clima sem dado ou fora da região não aplica taxa automática', async () => {
      rainWeather.forSurcharge.mockReturnValue(null);
      expect((await service.quote(input)).totalValue).toBe(12.5);
    });

    it('clima não vence a desativação geral e não empilha taxas', async () => {
      rainWeather.forSurcharge.mockReturnValue({ activeNow: true });
      prisma.surcharge.findMany.mockResolvedValue([
        { id: 'disabled', name: 'Desativada', active: false, schedules: [], value: 99 },
        {
          id: 'manual',
          name: 'Feriado',
          active: true,
          manuallyActive: true,
          schedules: [],
          value: 1,
          type: 'FIXED',
          driverSharePercentage: 0,
        },
        {
          id: 'rain-1',
          name: 'Chuva',
          active: true,
          manuallyActive: false,
          schedules: [],
          value: 3,
          type: 'FIXED',
          driverSharePercentage: 100,
        },
      ]);
      const result = await service.quote(input);
      expect(result.totalValue).toBe(13.5);
      expect(result.surchargeLabel).toBe('Feriado');
    });
  });

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
