import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminSurchargesService } from './admin-surcharges.service';

describe('AdminSurchargesService', () => {
  let service: AdminSurchargesService;
  let audit: { record: jest.Mock };
  let tx: {
    surcharge: { create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    surchargeSchedule: { deleteMany: jest.Mock };
  };
  let prisma: {
    region: { findFirst: jest.Mock };
    surcharge: { findMany: jest.Mock; findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  const surchargeRow = {
    id: 'surcharge-1',
    name: 'Chuva',
    type: 'FIXED' as const,
    value: { toString: () => '4.50' },
    driverSharePercentage: { toString: () => '80' },
    active: true,
    manuallyActive: false,
    createdAt: new Date('2026-08-25T12:00:00.000Z'),
    schedules: [],
  };

  beforeEach(async () => {
    tx = {
      surcharge: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      surchargeSchedule: { deleteMany: jest.fn() },
    };
    prisma = {
      region: { findFirst: jest.fn() },
      surcharge: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSurchargesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminSurchargesService);
  });

  it('cria a taxa e a auditoria na mesma transação', async () => {
    prisma.region.findFirst.mockResolvedValue({ id: 'region-1' });
    tx.surcharge.create.mockResolvedValue(surchargeRow);

    const result = await service.create(
      {
        name: 'Chuva',
        type: 'FIXED',
        value: 4.5,
        driverSharePercentage: 80,
        schedules: [],
      },
      'admin-1',
    );

    expect(result.name).toBe('Chuva');
    expect(tx.surcharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ regionId: 'region-1', name: 'Chuva', value: 4.5 }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SURCHARGE_CREATED',
        entityType: 'SURCHARGE',
        entityId: 'surcharge-1',
      }),
      tx,
    );
  });

  it('desativa a taxa, desliga o manual e registra a ação', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);
    tx.surcharge.update.mockResolvedValue({ ...surchargeRow, active: false });

    const result = await service.setActive('surcharge-1', false, 'admin-1');

    expect(result.active).toBe(false);
    expect(tx.surcharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'surcharge-1' },
        data: { active: false, manuallyActive: false },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SURCHARGE_DEACTIVATED', entityId: 'surcharge-1' }),
      tx,
    );
  });

  it('exclui a taxa e preserva o nome no histórico', async () => {
    prisma.surcharge.findUnique.mockResolvedValue(surchargeRow);

    await service.remove('surcharge-1', 'admin-1');

    expect(tx.surcharge.delete).toHaveBeenCalledWith({ where: { id: 'surcharge-1' } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'SURCHARGE_DELETED',
        entityType: 'SURCHARGE',
        entityId: 'surcharge-1',
        summary: 'Taxa adicional Chuva excluída.',
      }),
      tx,
    );
  });
});
