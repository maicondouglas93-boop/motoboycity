import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../auth/auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminCompaniesService } from './admin-companies.service';

describe('AdminCompaniesService', () => {
  let service: AdminCompaniesService;
  let prisma: {
    company: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    companyTeamMember: { findFirst: jest.Mock };
    companyAddress: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { update: jest.Mock };
    region: { findMany: jest.Mock };
    companyStatusHistory: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { replacePassword: jest.Mock };
  let realtimeGateway: { disconnectUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      companyTeamMember: { findFirst: jest.fn() },
      companyAddress: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { update: jest.fn() },
      region: { findMany: jest.fn() },
      companyStatusHistory: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => unknown) =>
      operation(prisma),
    );
    authService = { replacePassword: jest.fn() };
    realtimeGateway = { disconnectUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminCompaniesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: AdminAuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(AdminCompaniesService);
  });

  it('lista somente regiões ativas para o cadastro administrativo', async () => {
    prisma.region.findMany.mockResolvedValue([{ id: 'region-1', name: 'Lajinha' }]);

    await expect(service.registrationOptions()).resolves.toEqual({
      regions: [{ id: 'region-1', name: 'Lajinha' }],
    });
    expect(prisma.region.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
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
            {
              role: 'OWNER',
              user: { name: 'Dono Um', email: 'dono1@example.com', phone: '33999990000' },
            },
          ],
          approvedBy: null,
          approvedAt: null,
        },
        {
          id: 'company-2',
          legalName: 'Empresa Dois LTDA',
          tradeName: 'Empresa Dois',
          document: '55566677788',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          teamMembers: [],
          approvedBy: { id: 'admin-1', name: 'Admin Um' },
          approvedAt: new Date('2026-01-02T12:00:00.000Z'),
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
          approvedBy: null,
          approvedAt: null,
        },
        {
          id: 'company-2',
          legalName: 'Empresa Dois LTDA',
          tradeName: 'Empresa Dois',
          document: '55566677788',
          status: 'ACTIVE',
          createdAt: '2026-01-02T00:00:00.000Z',
          owner: null,
          approvedBy: { id: 'admin-1', name: 'Admin Um' },
          approvedAt: '2026-01-02T12:00:00.000Z',
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

  it('aprova uma empresa PENDING_APPROVAL, mudando o status para ACTIVE e gravando quem aprovou', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'PENDING_APPROVAL' });
    prisma.company.update.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' });

    const result = await service.approve('company-1', 'admin-1');

    expect(result).toEqual({
      companyId: 'company-1',
      status: 'ACTIVE',
      approvedByUserId: 'admin-1',
      approvedAt: expect.any(String),
    });
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: {
        status: 'ACTIVE',
        approvedByUserId: 'admin-1',
        approvedAt: expect.any(Date),
      },
    });
  });

  it('rejeita quando a empresa não existe', async () => {
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(service.approve('company-inexistente', 'admin-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rejeita quando a empresa já está ACTIVE', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'ACTIVE' });

    await expect(service.approve('company-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });

  it('rejeita quando a empresa está SUSPENDED', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'company-1', status: 'SUSPENDED' });

    await expect(service.approve('company-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('manutencao administrativa', () => {
    it('atualiza empresa e responsavel na mesma transacao', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
      prisma.companyTeamMember.findFirst.mockResolvedValue({ userId: 'owner-user-1' });
      jest.spyOn(service, 'detail').mockResolvedValue({ id: 'company-1' } as never);

      await service.updateProfile(
        'company-1',
        {
          tradeName: 'Nova Farma',
          legalName: 'Nova Farma LTDA',
          fullName: 'Maria Responsavel',
          whatsapp: '33999990000',
        },
        'admin-1',
      );

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { tradeName: 'Nova Farma', legalName: 'Nova Farma LTDA' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'owner-user-1' },
        data: { name: 'Maria Responsavel', phone: '33999990000' },
      });
    });

    it('atualiza o endereco principal e limpa coordenadas antigas', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'company-1' });
      prisma.companyAddress.findFirst.mockResolvedValue({ id: 'address-1' });
      jest.spyOn(service, 'detail').mockResolvedValue({ id: 'company-1' } as never);

      await service.upsertPrimaryAddress(
        'company-1',
        {
          street: 'Rua Nova',
          number: '25',
          city: 'Lajinha',
          state: 'MG',
          zip: '36980000',
        },
        'admin-1',
      );

      expect(prisma.companyAddress.update).toHaveBeenCalledWith({
        where: { id: 'address-1' },
        data: {
          street: 'Rua Nova',
          number: '25',
          city: 'Lajinha',
          state: 'MG',
          zip: '36980000',
          label: null,
          complement: null,
          lat: null,
          lng: null,
          isPrimary: true,
        },
      });
      expect(prisma.companyAddress.updateMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isPrimary: true, id: { not: 'address-1' } },
        data: { isPrimary: false },
      });
    });

    it('suspende a empresa de forma condicional e encerra as sessoes ativas', async () => {
      prisma.company.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        teamMembers: [{ userId: 'owner-user-1' }, { userId: 'operator-user-1' }],
      });
      prisma.company.updateMany.mockResolvedValue({ count: 1 });
      jest.spyOn(service, 'detail').mockResolvedValue({ id: 'company-1' } as never);

      await service.suspend('company-1', 'admin-1');

      expect(prisma.company.updateMany).toHaveBeenCalledWith({
        where: { id: 'company-1', status: 'ACTIVE' },
        data: { status: 'SUSPENDED', invoiceOverdueBlockedAt: null },
      });
      expect(realtimeGateway.disconnectUser).toHaveBeenCalledTimes(2);
      expect(realtimeGateway.disconnectUser).toHaveBeenCalledWith('owner-user-1');
      expect(realtimeGateway.disconnectUser).toHaveBeenCalledWith('operator-user-1');
    });

    it('recusa suspender uma empresa que nao esta ativa', async () => {
      prisma.company.findUnique.mockResolvedValue({
        status: 'PENDING_APPROVAL',
        teamMembers: [],
      });

      await expect(service.suspend('company-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.company.updateMany).not.toHaveBeenCalled();
    });

    it('atualiza a politica financeira e reinicia o marcador quando a agenda muda', async () => {
      prisma.company.findUnique.mockResolvedValue({
        invoiceClosingMode: 'AUTOMATIC',
        invoiceClosingFrequency: 'WEEKLY',
        invoiceClosingWeekday: 1,
        invoiceClosingMonthDay: null,
      });
      jest.spyOn(service, 'detail').mockResolvedValue({ id: 'company-1' } as never);

      await service.updateBillingSettings(
        'company-1',
        {
          invoiceClosingMode: 'AUTOMATIC',
          invoiceClosingFrequency: 'MONTHLY',
          invoiceClosingWeekday: null,
          invoiceClosingMonthDay: 31,
          invoiceOverdueBlockAfterDays: 10,
        },
        'admin-1',
      );

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: {
          invoiceClosingMode: 'AUTOMATIC',
          invoiceClosingFrequency: 'MONTHLY',
          invoiceClosingWeekday: null,
          invoiceClosingMonthDay: 31,
          invoiceOverdueBlockAfterDays: 10,
          lastAutomaticInvoiceClosingDate: null,
        },
      });
    });
  });

  describe('changeMemberPassword', () => {
    it('altera apenas a senha de um responsável ativo da empresa e encerra suas conexões', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue({ userId: 'owner-user-1' });
      authService.replacePassword.mockResolvedValue({ userId: 'owner-user-1' });

      await expect(
        service.changeMemberPassword('company-1', 'member-1', 'senhaNova123', 'admin-1'),
      ).resolves.toEqual({ userId: 'owner-user-1' });
      expect(prisma.companyTeamMember.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'member-1',
          companyId: 'company-1',
          active: true,
          user: { type: 'COMPANY_MEMBER' },
        },
        select: { userId: true },
      });
      expect(authService.replacePassword).toHaveBeenCalledWith('owner-user-1', 'senhaNova123', {
        mutateInSameTransaction: expect.any(Function),
      });
      expect(realtimeGateway.disconnectUser).toHaveBeenCalledWith('owner-user-1');
    });

    it('rejeita membro que não seja responsável ativo da empresa', async () => {
      prisma.companyTeamMember.findFirst.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue({ id: 'company-1' });

      await expect(
        service.changeMemberPassword('company-1', 'member-invalido', 'senhaNova123', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authService.replacePassword).not.toHaveBeenCalled();
    });
  });
});
