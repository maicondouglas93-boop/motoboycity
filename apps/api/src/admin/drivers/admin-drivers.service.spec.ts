import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../auth/auth.service';
import { DispatchService } from '../../dispatch/dispatch.service';
import { LiveDriverPresenceService } from '../../live-presence/live-driver-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { ImageKitService } from '../../media/imagekit.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { DriverPunishmentService } from '../../driver-punishment/driver-punishment.service';
import { AdminDriversService } from './admin-drivers.service';

describe('AdminDriversService', () => {
  let service: AdminDriversService;
  let prisma: {
    driver: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    serviceType: { findMany: jest.Mock };
    driverServiceType: { deleteMany: jest.Mock; createMany: jest.Mock };
    driverCompanyBlock: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    company: { findUnique: jest.Mock };
    driverPresenceLog: { updateMany: jest.Mock };
    deliveryStatusHistory: { groupBy: jest.Mock };
    region: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let dispatchService: {
    releasePendingOffersForDriver: jest.Mock;
    dispatchAvailableDeliveries: jest.Mock;
  };
  let authService: { replacePassword: jest.Mock };
  let livePresence: { remove: jest.Mock };
  let realtimeGateway: {
    emitToDriver: jest.Mock;
    emitDriverPresence: jest.Mock;
    emitAdminActivity: jest.Mock;
    disconnectUser: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      driver: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      serviceType: { findMany: jest.fn() },
      driverServiceType: { deleteMany: jest.fn(), createMany: jest.fn() },
      driverCompanyBlock: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        delete: jest.fn(),
      },
      company: { findUnique: jest.fn() },
      driverPresenceLog: { updateMany: jest.fn() },
      deliveryStatusHistory: { groupBy: jest.fn().mockResolvedValue([]) },
      region: { findMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'driver-1' }]),
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
    };

    dispatchService = {
      releasePendingOffersForDriver: jest.fn().mockResolvedValue(0),
      dispatchAvailableDeliveries: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      replacePassword: jest.fn().mockImplementation(
        async (
          userId: string,
          _password: string,
          options?: {
            mutateInSameTransaction?: (tx: typeof prisma) => Promise<void>;
          },
        ) => {
          await options?.mutateInSameTransaction?.(prisma);
          return { userId };
        },
      ),
    };
    livePresence = { remove: jest.fn().mockResolvedValue(undefined) };
    realtimeGateway = {
      emitToDriver: jest.fn(),
      emitDriverPresence: jest.fn(),
      emitAdminActivity: jest.fn(),
      disconnectUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDriversService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: authService },
        { provide: DispatchService, useValue: dispatchService },
        { provide: LiveDriverPresenceService, useValue: livePresence },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        {
          provide: ImageKitService,
          useValue: {
            uploadDriverDocument: jest.fn(),
            deleteImage: jest.fn(),
          },
        },
        { provide: AdminAuditService, useValue: { record: jest.fn() } },
        {
          provide: DriverPunishmentService,
          useValue: { revoke: jest.fn(), listForDriver: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AdminDriversService);
  });

  describe('changePassword', () => {
    it('resolve o usuário do motoboy, troca a senha e encerra conexões antigas', async () => {
      prisma.driver.findFirst.mockResolvedValue({ userId: 'driver-user-1' });

      await expect(service.changePassword('driver-1', 'senhaNova123', 'admin-1')).resolves.toEqual({
        userId: 'driver-user-1',
      });
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { id: 'driver-1', user: { type: 'DRIVER' } },
        select: { userId: true },
      });
      expect(authService.replacePassword).toHaveBeenCalledWith('driver-user-1', 'senhaNova123', {
        mutateInSameTransaction: expect.any(Function),
      });
      expect(realtimeGateway.disconnectUser).toHaveBeenCalledWith('driver-user-1');
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { availability: 'UNAVAILABLE' },
      });
      expect(prisma.driverPresenceLog.updateMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1', wentOfflineAt: null },
        data: { wentOfflineAt: expect.any(Date) },
      });
      expect(livePresence.remove).toHaveBeenCalledWith('driver-1');
      expect(dispatchService.releasePendingOffersForDriver).toHaveBeenCalledWith('driver-1');
      expect(realtimeGateway.emitDriverPresence).toHaveBeenCalledWith(
        expect.objectContaining({
          driverId: 'driver-1',
          availability: 'UNAVAILABLE',
          reason: 'PASSWORD_RESET',
        }),
      );
    });

    it('mantém o reset concluído quando Redis e fila falham após a transação', async () => {
      prisma.driver.findFirst.mockResolvedValue({ userId: 'driver-user-1' });
      livePresence.remove.mockRejectedValue(new Error('redis offline'));
      dispatchService.releasePendingOffersForDriver.mockRejectedValue(new Error('queue offline'));
      (service as unknown as { logger: { warn: jest.Mock } }).logger = { warn: jest.fn() };

      await expect(service.changePassword('driver-1', 'senhaNova123', 'admin-1')).resolves.toEqual({
        userId: 'driver-user-1',
      });

      expect(livePresence.remove).toHaveBeenCalledTimes(3);
      expect(dispatchService.releasePendingOffersForDriver).toHaveBeenCalledTimes(3);
      expect(realtimeGateway.emitAdminActivity).toHaveBeenCalledWith(
        expect.stringContaining('limpeza externa pendente'),
      );
    });

    it('retorna 404 sem alterar credenciais quando o motoboy não existe', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(
        service.changePassword('driver-inexistente', 'senhaNova123', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authService.replacePassword).not.toHaveBeenCalled();
    });
  });

  describe('registrationOptions', () => {
    it('lista somente as regiões ativas em ordem alfabética', async () => {
      prisma.region.findMany.mockResolvedValue([
        { id: 'region-2', name: 'Belo Horizonte' },
        { id: 'region-1', name: 'Lajinha' },
      ]);

      const result = await service.registrationOptions();

      expect(prisma.region.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      expect(result.regions).toHaveLength(2);
    });
  });

  describe('bloqueio por empresa', () => {
    it('bloqueia e solta somente ofertas pendentes daquela empresa', async () => {
      const blockedAt = new Date('2026-08-29T12:00:00.000Z');
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.company.findUnique.mockResolvedValue({ id: 'company-1', tradeName: 'Loja X' });
      prisma.driverCompanyBlock.create.mockResolvedValue({
        id: 'block-1',
        driverId: 'driver-1',
        companyId: 'company-1',
        reason: 'Solicitacao da empresa',
        blockedAt,
        company: { id: 'company-1', tradeName: 'Loja X' },
      });

      await expect(
        service.blockCompany(
          'driver-1',
          { companyId: 'company-1', reason: 'Solicitacao da empresa' },
          'admin-1',
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'block-1',
          company: { id: 'company-1', tradeName: 'Loja X' },
        }),
      );
      expect(dispatchService.releasePendingOffersForDriver).toHaveBeenCalledWith(
        'driver-1',
        'company-1',
      );
    });

    it('libera a empresa e acorda os pedidos que ficaram sem candidato', async () => {
      prisma.driverCompanyBlock.findUnique.mockResolvedValue({
        id: 'block-1',
        company: { tradeName: 'Loja X' },
      });

      await expect(service.unblockCompany('driver-1', 'company-1', 'admin-1')).resolves.toEqual({
        driverId: 'driver-1',
        companyId: 'company-1',
        blocked: false,
      });
      expect(prisma.driverCompanyBlock.delete).toHaveBeenCalledWith({ where: { id: 'block-1' } });
      expect(dispatchService.dispatchAvailableDeliveries).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('mapeia motoboys para o formato de listagem, incluindo quem revisou', async () => {
      prisma.driver.findMany.mockResolvedValue([
        {
          id: 'driver-1',
          userId: 'user-1',
          cpf: '11122233344',
          approvalStatus: 'PENDING',
          accountStatus: 'ACTIVE',
          availability: 'UNAVAILABLE',
          appVersion: null,
          lastSeenAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { name: 'Motoboy Um', email: 'motoboy1@example.com', phone: '33999990000' },
          region: { id: 'region-1', name: 'Lajinha' },
          reviewedBy: null,
          reviewedAt: null,
          serviceTypes: [],
        },
        {
          id: 'driver-2',
          userId: 'user-2',
          cpf: '55566677788',
          approvalStatus: 'APPROVED',
          accountStatus: 'SUSPENDED',
          availability: 'UNAVAILABLE',
          appVersion: '1.0.0',
          lastSeenAt: new Date('2026-01-02T11:55:00.000Z'),
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          user: { name: 'Motoboy Dois', email: 'motoboy2@example.com', phone: '33999991111' },
          region: { id: 'region-1', name: 'Lajinha' },
          reviewedBy: { id: 'admin-1', name: 'Admin Um' },
          reviewedAt: new Date('2026-01-02T12:00:00.000Z'),
          serviceTypes: [
            {
              isPrimary: true,
              serviceType: { id: 'service-1', code: 'MOTO', name: 'Moto' },
            },
          ],
        },
      ]);
      // Só o segundo devolveu pedidos na janela — o primeiro tem que sair zero,
      // e não indefinido.
      prisma.deliveryStatusHistory.groupBy.mockResolvedValue([
        { changedByUserId: 'user-2', _count: { _all: 3 } },
      ]);

      const result = await service.list({});

      expect(result).toEqual([
        {
          id: 'driver-1',
          name: 'Motoboy Um',
          email: 'motoboy1@example.com',
          phone: '33999990000',
          cpf: '11122233344',
          region: { id: 'region-1', name: 'Lajinha' },
          approvalStatus: 'PENDING',
          accountStatus: 'ACTIVE',
          availability: 'UNAVAILABLE',
          appVersion: null,
          lastSeenAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          reviewedBy: null,
          reviewedAt: null,
          serviceTypes: [],
          returnsLast7Days: 0,
        },
        {
          id: 'driver-2',
          name: 'Motoboy Dois',
          email: 'motoboy2@example.com',
          phone: '33999991111',
          cpf: '55566677788',
          region: { id: 'region-1', name: 'Lajinha' },
          approvalStatus: 'APPROVED',
          accountStatus: 'SUSPENDED',
          availability: 'UNAVAILABLE',
          appVersion: '1.0.0',
          lastSeenAt: '2026-01-02T11:55:00.000Z',
          createdAt: '2026-01-02T00:00:00.000Z',
          reviewedBy: { id: 'admin-1', name: 'Admin Um' },
          reviewedAt: '2026-01-02T12:00:00.000Z',
          serviceTypes: [{ id: 'service-1', code: 'MOTO', name: 'Moto', isPrimary: true }],
          returnsLast7Days: 3,
        },
      ]);
    });

    it('conta devolucoes pela transicao de aceito de volta para a fila', async () => {
      prisma.driver.findMany.mockResolvedValue([]);

      await service.list({});

      // Sem motoboy na lista nao ha o que contar: a consulta agrupada nem sai.
      expect(prisma.deliveryStatusHistory.groupBy).not.toHaveBeenCalled();
    });

    it('a janela de devolucoes olha so a transicao ACCEPTED -> AWAITING_DRIVER', async () => {
      prisma.driver.findMany.mockResolvedValue([
        {
          id: 'driver-1',
          userId: 'user-1',
          cpf: '11122233344',
          approvalStatus: 'APPROVED',
          accountStatus: 'ACTIVE',
          availability: 'AVAILABLE',
          appVersion: null,
          lastSeenAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          user: { name: 'Motoboy Um', email: 'm1@example.com', phone: '33999990000' },
          region: { id: 'region-1', name: 'Lajinha' },
          reviewedBy: null,
          reviewedAt: null,
          serviceTypes: [],
        },
      ]);

      await service.list({});

      const where = prisma.deliveryStatusHistory.groupBy.mock.calls[0]?.[0]?.where;
      // E a assinatura da devolucao: o pedido andou para TRAS. Nenhuma outra
      // transicao faz esse caminho, entao contar por ela nao pega carona em
      // cancelamento nem em reatribuicao feita pelo admin.
      expect(where.fromStatus).toBe('ACCEPTED');
      expect(where.toStatus).toBe('AWAITING_DRIVER');
      expect(where.changedByUserId).toEqual({ in: ['user-1'] });
      expect(where.changedAt.gte).toBeInstanceOf(Date);
    });

    it('repassa os filtros de status para a query do Prisma', async () => {
      prisma.driver.findMany.mockResolvedValue([]);

      await service.list({ approvalStatus: 'PENDING', accountStatus: 'ACTIVE' });

      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { approvalStatus: 'PENDING', accountStatus: 'ACTIVE' },
        }),
      );
    });
  });

  describe('approve', () => {
    it('aprova um motoboy PENDING, gravando quem revisou', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'PENDING' });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', approvalStatus: 'APPROVED' });

      const result = await service.approve('driver-1', 'admin-1');

      expect(result).toEqual({
        driverId: 'driver-1',
        approvalStatus: 'APPROVED',
        reviewedByUserId: 'admin-1',
        reviewedAt: expect.any(String),
      });
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          approvalStatus: 'APPROVED',
          reviewedByUserId: 'admin-1',
          reviewedAt: expect.any(Date),
        },
      });
    });

    it('rejeita aprovar um motoboy que não está PENDING', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'APPROVED' });

      await expect(service.approve('driver-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('retorna 404 quando o motoboy não existe', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.approve('inexistente', 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reject', () => {
    it('rejeita um motoboy PENDING, gravando quem revisou', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'PENDING' });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', approvalStatus: 'REJECTED' });

      const result = await service.reject('driver-1', 'admin-1');

      expect(result.approvalStatus).toBe('REJECTED');
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          approvalStatus: 'REJECTED',
          reviewedByUserId: 'admin-1',
          reviewedAt: expect.any(Date),
        },
      });
    });

    it('rejeita a ação quando o motoboy não está PENDING', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1', approvalStatus: 'REJECTED' });

      await expect(service.reject('driver-1', 'admin-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('suspend / block / reactivate', () => {
    // P1-03: suspender/bloquear nao pode ser so trocar o enum. Antes disto o motoboy
    // seguia marcado como AVAILABLE, com log de presenca aberto contando tempo online, e
    // as ofertas na mao dele ficavam paradas ate expirar sozinhas.
    it('suspende, tira da disponibilidade e fecha a sessao de presenca', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'SUSPENDED' });

      const result = await service.suspend('driver-1', 'admin-1');

      expect(result).toEqual({ driverId: 'driver-1', accountStatus: 'SUSPENDED' });
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { accountStatus: 'SUSPENDED', availability: 'UNAVAILABLE' },
      });
      expect(prisma.driverPresenceLog.updateMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1', wentOfflineAt: null },
        data: { wentOfflineAt: expect.any(Date) },
      });
    });

    it('devolve as ofertas pendentes para a fila e avisa o aplicativo do motoboy', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'BLOCKED' });
      dispatchService.releasePendingOffersForDriver.mockResolvedValue(2);

      await service.block('driver-1', 'admin-1');

      expect(dispatchService.releasePendingOffersForDriver).toHaveBeenCalledWith('driver-1');
      expect(livePresence.remove).toHaveBeenCalledWith('driver-1');
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'driver:account-status-changed',
        { accountStatus: 'BLOCKED' },
      );
    });

    // Reativar devolve o direito de trabalhar, nao a disponibilidade: ficar online e
    // escolha do motoboy. Reativar sozinho o colocaria para receber pedido sem ter pedido.
    it('reativar nao devolve a disponibilidade nem mexe nas ofertas', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'BLOCKED',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'ACTIVE' });

      await service.reactivate('driver-1', 'admin-1');

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { accountStatus: 'ACTIVE' },
      });
      expect(prisma.driverPresenceLog.updateMany).not.toHaveBeenCalled();
      expect(dispatchService.releasePendingOffersForDriver).not.toHaveBeenCalled();
    });

    it('bloqueia um motoboy APPROVED mesmo que já esteja SUSPENDED', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'SUSPENDED',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'BLOCKED' });

      const result = await service.block('driver-1', 'admin-1');

      expect(result).toEqual({ driverId: 'driver-1', accountStatus: 'BLOCKED' });
    });

    it('rejeita suspender um motoboy que ainda não foi aprovado', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'PENDING',
        accountStatus: 'ACTIVE',
      });

      await expect(service.suspend('driver-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('rejeita suspender um motoboy que já está SUSPENDED', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'SUSPENDED',
      });

      await expect(service.suspend('driver-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('reativa um motoboy BLOCKED de volta para ACTIVE', async () => {
      prisma.driver.findUnique.mockResolvedValue({
        id: 'driver-1',
        approvalStatus: 'APPROVED',
        accountStatus: 'BLOCKED',
      });
      prisma.driver.update.mockResolvedValue({ id: 'driver-1', accountStatus: 'ACTIVE' });

      const result = await service.reactivate('driver-1', 'admin-1');

      expect(result).toEqual({ driverId: 'driver-1', accountStatus: 'ACTIVE' });
    });
  });

  describe('replaceServiceTypes', () => {
    it('substitui as modalidades de forma atômica e preserva a ordem escolhida', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.serviceType.findMany.mockResolvedValue([
        { id: 'service-1', code: 'MOTO', name: 'Moto' },
        { id: 'service-2', code: 'CARRO', name: 'Carro' },
      ]);

      const result = await service.replaceServiceTypes(
        'driver-1',
        {
          serviceTypeIds: ['service-2', 'service-1'],
        },
        'admin-1',
      );

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(prisma.driverServiceType.deleteMany).toHaveBeenCalledWith({
        where: { driverId: 'driver-1' },
      });
      expect(prisma.driverServiceType.createMany).toHaveBeenCalledWith({
        data: [
          { driverId: 'driver-1', serviceTypeId: 'service-2', isPrimary: true },
          { driverId: 'driver-1', serviceTypeId: 'service-1', isPrimary: false },
        ],
      });
      expect(result).toEqual({
        driverId: 'driver-1',
        serviceTypes: [
          { id: 'service-2', code: 'CARRO', name: 'Carro', isPrimary: true },
          { id: 'service-1', code: 'MOTO', name: 'Moto', isPrimary: false },
        ],
      });
    });

    it('rejeita a substituição se qualquer modalidade não existe ou está inativa', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      prisma.serviceType.findMany.mockResolvedValue([
        { id: 'service-1', code: 'MOTO', name: 'Moto' },
      ]);

      await expect(
        service.replaceServiceTypes(
          'driver-1',
          {
            serviceTypeIds: ['service-1', 'service-inactive'],
          },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.driverServiceType.deleteMany).not.toHaveBeenCalled();
      expect(prisma.driverServiceType.createMany).not.toHaveBeenCalled();
    });

    it('retorna 404 sem alterar as modalidades quando o motoboy não existe', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.replaceServiceTypes('missing', { serviceTypeIds: ['service-1'] }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.driverServiceType.deleteMany).not.toHaveBeenCalled();
    });
  });
});
