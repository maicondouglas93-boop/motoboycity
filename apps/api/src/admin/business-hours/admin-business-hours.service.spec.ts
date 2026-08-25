import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminPlatformSettingsService } from '../platform-settings/admin-platform-settings.service';
import { AdminBusinessHoursService } from './admin-business-hours.service';

describe('AdminBusinessHoursService', () => {
  let service: AdminBusinessHoursService;
  let audit: { record: jest.Mock };
  let tx: { businessHour: { deleteMany: jest.Mock; createMany: jest.Mock } };
  let prisma: {
    region: { findFirst: jest.Mock };
    businessHour: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let platformSettings: { get: jest.Mock };

  beforeEach(async () => {
    tx = { businessHour: { deleteMany: jest.fn(), createMany: jest.fn() } };
    prisma = {
      region: { findFirst: jest.fn().mockResolvedValue({ id: 'region-1' }) },
      businessHour: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    };
    platformSettings = { get: jest.fn().mockResolvedValue({ businessHoursEnabled: true }) };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBusinessHoursService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettings },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminBusinessHoursService);
  });

  it('substitui todas as faixas e audita a quantidade na mesma transação', async () => {
    const hours = [{ weekday: 1, startMinute: 480, endMinute: 1080 }];

    const result = await service.replace({ hours }, 'admin-1');

    expect(tx.businessHour.deleteMany).toHaveBeenCalledWith({ where: { regionId: 'region-1' } });
    expect(tx.businessHour.createMany).toHaveBeenCalledWith({
      data: [{ ...hours[0], regionId: 'region-1' }],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'BUSINESS_HOURS_REPLACED',
        entityType: 'BUSINESS_HOURS',
        entityId: 'region-1',
        summary: 'Horário de funcionamento substituído com 1 faixa(s).',
      }),
      tx,
    );
    expect(result.enabled).toBe(true);
  });
});
