import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminServiceTypesService } from './admin-service-types.service';

const actorUserId = 'admin-1';

describe('AdminServiceTypesService', () => {
  let service: AdminServiceTypesService;
  let prisma: {
    serviceType: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    const serviceType = {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    prisma = {
      serviceType,
      $transaction: jest.fn().mockImplementation(async (callback) => callback({ serviceType })),
    };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminServiceTypesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AdminServiceTypesService);
  });

  describe('list', () => {
    it('mapeia tipos de serviço para o formato de listagem', async () => {
      prisma.serviceType.findMany.mockResolvedValue([
        {
          id: 'st-1',
          code: 'MOTO',
          name: 'Moto',
          active: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.list({});

      expect(result).toEqual([
        {
          id: 'st-1',
          code: 'MOTO',
          name: 'Moto',
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('repassa o filtro active para a query', async () => {
      prisma.serviceType.findMany.mockResolvedValue([]);

      await service.list({ active: true });

      expect(prisma.serviceType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
    });

    it('não filtra quando active não é informado', async () => {
      prisma.serviceType.findMany.mockResolvedValue([]);

      await service.list({});

      expect(prisma.serviceType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  describe('create', () => {
    it('cria um tipo de serviço novo', async () => {
      prisma.serviceType.findUnique.mockResolvedValue(null);
      prisma.serviceType.create.mockResolvedValue({
        id: 'st-1',
        code: 'MOTO',
        name: 'Moto',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.create({ code: 'MOTO', name: 'Moto' }, actorUserId);

      expect(result).toEqual({
        id: 'st-1',
        code: 'MOTO',
        name: 'Moto',
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          action: 'SERVICE_TYPE_CREATED',
          entityType: 'SERVICE_TYPE',
          entityId: 'st-1',
        }),
        expect.objectContaining({ serviceType: prisma.serviceType }),
      );
    });

    it('rejeita código duplicado', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1' });

      await expect(
        service.create({ code: 'MOTO', name: 'Moto' }, actorUserId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.serviceType.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('atualiza name e active', async () => {
      prisma.serviceType.findUnique.mockResolvedValue({ id: 'st-1' });
      prisma.serviceType.update.mockResolvedValue({
        id: 'st-1',
        code: 'MOTO',
        name: 'Moto Rápida',
        active: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.update(
        'st-1',
        { name: 'Moto Rápida', active: false },
        actorUserId,
      );

      expect(result.name).toBe('Moto Rápida');
      expect(result.active).toBe(false);
      expect(prisma.serviceType.update).toHaveBeenCalledWith({
        where: { id: 'st-1' },
        data: { name: 'Moto Rápida', active: false },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          action: 'SERVICE_TYPE_DEACTIVATED',
          entityType: 'SERVICE_TYPE',
          entityId: 'st-1',
        }),
        expect.objectContaining({ serviceType: prisma.serviceType }),
      );
    });

    it('retorna 404 quando o tipo de serviço não existe', async () => {
      prisma.serviceType.findUnique.mockResolvedValue(null);

      await expect(
        service.update('inexistente', { active: false }, actorUserId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
