import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPlatformSettingsService } from './admin-platform-settings.service';

describe('AdminPlatformSettingsService', () => {
  let service: AdminPlatformSettingsService;
  let prisma: {
    platformSettings: { findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      platformSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminPlatformSettingsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminPlatformSettingsService);
  });

  describe('get', () => {
    it('retorna tudo null quando ainda não foi configurado', async () => {
      prisma.platformSettings.findUnique.mockResolvedValue(null);

      const result = await service.get();

      expect(result).toEqual({ driverCommissionPercentage: null, updatedBy: null, updatedAt: null });
    });

    it('converte Decimal para number e inclui quem atualizou', async () => {
      prisma.platformSettings.findUnique.mockResolvedValue({
        driverCommissionPercentage: { toString: () => '80.00' },
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.get();

      expect(result).toEqual({
        driverCommissionPercentage: 80,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('update', () => {
    it('faz upsert gravando quem atualizou', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: { toString: () => '75.00' },
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.update({ driverCommissionPercentage: 75 }, 'admin-1');

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        update: { driverCommissionPercentage: 75, updatedByUserId: 'admin-1' },
        create: { id: 'global', driverCommissionPercentage: 75, updatedByUserId: 'admin-1' },
        include: { updatedBy: true },
      });
      expect(result).toEqual({
        driverCommissionPercentage: 75,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });
});
