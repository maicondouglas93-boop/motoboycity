import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminCompaniesService } from './admin-companies.service';

describe('AdminCompaniesService', () => {
  let service: AdminCompaniesService;
  let prisma: {
    company: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminCompaniesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminCompaniesService);
  });

  describe('list', () => {
    it('mapeia empresas para o formato de listagem, extraindo o dono (OWNER)', async () => {
      prisma.company.findMany.mockResolvedValue([
        {
          id: 'company-1',
          legalName: 'Empresa Um LTDA',
          tradeName: 'Empresa Um',
          document: '11122233344',
          status: 'PENDING_APPROVAL',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          teamMembers: [
            { user: { name: 'Dono Um', email: 'dono1@example.com', phone: '33999990000' } },
          ],
        },
        {
          id: 'company-2',
          legalName: 'Empresa Dois LTDA',
          tradeName: 'Empresa Dois',
          document: '55566677788',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          teamMembers: [],
        },
      ]);

      const result = await service.list();

      expect(result).toEqual([
        {
          id: 'company-1',
          legalName: 'Empresa Um LTDA',
          tradeName: 'Empresa Um',
          document: '11122233344',
          status: 'PENDING_APPROVAL',
          createdAt: '2026-01-01T00:00:00.000Z',
          owner: { name: 'Dono Um', email: 'dono1@example.com', phone: '33999990000' },
        },
        {
          id: 'company-2',
          legalName: 'Empresa Dois LTDA',
          tradeName: 'Empresa Dois',
          document: '55566677788',
          status: 'ACTIVE',
          createdAt: '2026-01-02T00:00:00.000Z',
          owner: null,
        },
      ]);
    });

    it('repassa o filtro de status para a query do Prisma', async () => {
      prisma.company.findMany.mockResolvedValue([]);

      await service.list('PENDING_APPROVAL');

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING_APPROVAL' } }),
      );
    });

    it('não filtra por status quando nenhum é informado', async () => {
      prisma.company.findMany.mockResolvedValue([]);

      await service.list();

      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  it('aprova uma empresa PENDING_APPROVAL, mudando o status para ACTIVE', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'PENDING_APPROVAL' });
    prisma.company.update.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' });

    const result = await service.approve('company-1');

    expect(result).toEqual({ companyId: 'company-1', status: 'ACTIVE' });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { status: 'ACTIVE' },
    });
  });

  it('rejeita quando a empresa não existe', async () => {
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(service.approve('company-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rejeita quando a empresa já está ACTIVE', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' });

    await expect(service.approve('company-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rejeita quando a empresa está SUSPENDED', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'SUSPENDED' });

    await expect(service.approve('company-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
