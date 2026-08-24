import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyReportsService } from './company-reports.service';

const companyUser = { id: 'user-company', type: 'COMPANY_MEMBER' } as User;
const period = { from: '2026-08-10', to: '2026-08-16' };

function createdDelivery(extra: Record<string, unknown> = {}) {
  return {
    status: 'AWAITING_DRIVER',
    createdAt: new Date('2026-08-10T15:00:00Z'),
    totalValue: 12.5,
    requiresReturn: false,
    returnValue: null,
    batchId: null,
    serviceType: { name: 'Padrão' },
    ...extra,
  };
}

function completedDelivery(extra: Record<string, unknown> = {}) {
  return {
    statusChangedAt: new Date('2026-08-11T18:00:00Z'),
    totalValue: 12.5,
    requiresReturn: false,
    returnValue: null,
    serviceType: { name: 'Padrão' },
    ...extra,
  };
}

describe('CompanyReportsService.operations', () => {
  let service: CompanyReportsService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    delivery: {
      findMany: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      companyTeamMember: {
        findFirst: jest.fn().mockResolvedValue({ companyId: 'company-1' }),
      },
      delivery: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 0, totalValue: 0 },
          _sum: { totalValue: null },
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyReportsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(CompanyReportsService);
  });

  it('resolve a empresa pelo token e aplica o escopo em todas as consultas', async () => {
    await service.operations(companyUser, period);

    expect(prisma.companyTeamMember.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-company' },
      select: { companyId: true },
    });
    for (const call of prisma.delivery.findMany.mock.calls) {
      expect(call[0].where.companyId).toBe('company-1');
    }
    expect(prisma.delivery.count.mock.calls[0]?.[0].where.companyId).toBe('company-1');
    expect(prisma.delivery.aggregate.mock.calls[0]?.[0].where.companyId).toBe('company-1');
  });

  it('recusa usuário que não é empresa antes de consultar entregas', async () => {
    const driver = { id: 'driver-user', type: 'DRIVER' } as User;

    await expect(service.operations(driver, period)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.delivery.findMany).not.toHaveBeenCalled();
  });

  it('recusa empresa sem vínculo em vez de devolver relatório vazio', async () => {
    prisma.companyTeamMember.findFirst.mockResolvedValue(null);

    await expect(service.operations(companyUser, period)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('mantém criados e concluídos como coortes independentes', async () => {
    prisma.delivery.findMany
      .mockResolvedValueOnce([
        createdDelivery({ status: 'AWAITING_DRIVER' }),
        createdDelivery({ status: 'CANCELLED' }),
      ])
      // Pode ter sido criado antes e concluído agora: ainda pertence à série de conclusão.
      .mockResolvedValueOnce([completedDelivery()]);

    const report = await service.operations(companyUser, period);

    expect(report.ordersCreated.count).toBe(2);
    expect(report.ordersCreated.byCurrentStatus.CANCELLED).toBe(1);
    expect(report.deliveriesCompleted.count).toBe(1);
  });

  it('soma dinheiro em centavos e exclui sem preço do ticket médio', async () => {
    prisma.delivery.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        completedDelivery({ totalValue: 10.1 }),
        completedDelivery({ totalValue: 20.2 }),
        completedDelivery({ totalValue: null }),
      ]);

    const report = await service.operations(companyUser, period);

    expect(report.deliveriesCompleted).toEqual({
      count: 3,
      pricedCount: 2,
      unpricedCount: 1,
      totalValue: 30.3,
      averageTicket: 15.15,
    });
  });

  it('agrupa criação e conclusão pelo relógio de São Paulo', async () => {
    prisma.delivery.findMany
      .mockResolvedValueOnce([
        // 01:30 UTC ainda é 22:30 do dia anterior em São Paulo.
        createdDelivery({ createdAt: new Date('2026-08-11T01:30:00Z') }),
      ])
      .mockResolvedValueOnce([
        completedDelivery({
          statusChangedAt: new Date('2026-08-12T01:30:00Z'),
          totalValue: 9.9,
        }),
      ]);

    const report = await service.operations(companyUser, period);

    expect(report.daily).toHaveLength(7);
    expect(report.daily.find((day) => day.date === '2026-08-10')?.createdCount).toBe(1);
    expect(report.daily.find((day) => day.date === '2026-08-11')).toEqual({
      date: '2026-08-11',
      createdCount: 0,
      completedCount: 1,
      completedTotalValue: 9.9,
    });
  });

  it('compara com janela anterior de mesma duração, sem sobreposição', async () => {
    await service.operations(companyUser, period);

    const currentCreated = prisma.delivery.findMany.mock.calls[0]?.[0].where.createdAt;
    const previousCreated = prisma.delivery.count.mock.calls[0]?.[0].where.createdAt;
    const currentDuration = currentCreated.lt.getTime() - currentCreated.gte.getTime();
    const previousDuration = previousCreated.lt.getTime() - previousCreated.gte.getTime();

    expect(previousDuration).toBe(currentDuration);
    expect(previousCreated.lt.getTime()).toBe(currentCreated.gte.getTime());
    expect(previousCreated.gte.getTime()).toBeLessThan(previousCreated.lt.getTime());
  });

  it('resume modalidade, retorno e lote sem expor valores internos', async () => {
    prisma.delivery.findMany
      .mockResolvedValueOnce([
        createdDelivery({ requiresReturn: true, batchId: 'batch-a' }),
        createdDelivery({ requiresReturn: false, batchId: 'batch-a' }),
        createdDelivery({ requiresReturn: false, batchId: 'batch-b' }),
      ])
      .mockResolvedValueOnce([
        completedDelivery({ requiresReturn: true, returnValue: 4.5, totalValue: 20 }),
      ]);

    const report = await service.operations(companyUser, period);
    const serialized = JSON.stringify(report);

    expect(report.returns).toEqual({
      createdCount: 1,
      completedCount: 1,
      completedReturnValue: 4.5,
    });
    expect(report.batches).toEqual({ batchCount: 2, deliveryCount: 3 });
    expect(report.serviceTypes[0]).toEqual(
      expect.objectContaining({
        serviceTypeName: 'Padrão',
        createdCount: 3,
        completedCount: 1,
        completedTotalValue: 20,
        averageTicket: 20,
      }),
    );
    expect(serialized).not.toContain('driverValue');
    expect(serialized).not.toContain('platformValue');
  });
});
