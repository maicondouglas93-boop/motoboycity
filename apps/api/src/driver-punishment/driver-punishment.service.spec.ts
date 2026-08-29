import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DriverPunishmentService } from './driver-punishment.service';

/**
 * A configuracao usada na maioria dos testes: regra ligada, duas recusas e 40
 * minutos — os mesmos numeros da tela que originou o recorte.
 */
const CONFIG_PADRAO = {
  driverPunishmentEnabled: true,
  driverPunishmentTrigger: 'DECLINED' as const,
  driverPunishmentOfferCount: 2,
  driverPunishmentMinutes: 40,
  driverPunishmentIgnoreWithActiveDelivery: false,
  driverPunishmentOncePerDelivery: true,
};

describe('DriverPunishmentService', () => {
  let service: DriverPunishmentService;
  let prisma: {
    driverPunishment: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    driver: { update: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock };
    delivery: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let platformSettingsService: { get: jest.Mock };
  let realtimeGateway: { emitToDriver: jest.Mock; emitAdminActivity: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      driverPunishment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      driver: {
        update: jest.fn().mockResolvedValue({ consecutiveOfferRefusals: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'driver-1' }),
      },
      delivery: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    platformSettingsService = { get: jest.fn().mockResolvedValue(CONFIG_PADRAO) };
    realtimeGateway = { emitToDriver: jest.fn(), emitAdminActivity: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverPunishmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: AdminAuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(DriverPunishmentService);
  });

  function recusa(kind: 'DECLINED' | 'EXPIRED' = 'DECLINED') {
    return service.registerRefusal({ driverId: 'driver-1', deliveryId: 'delivery-1', kind });
  }

  describe('registerRefusal', () => {
    it('não conta nem pune com a regra desligada', async () => {
      platformSettingsService.get.mockResolvedValue({
        ...CONFIG_PADRAO,
        driverPunishmentEnabled: false,
      });

      await expect(recusa()).resolves.toBeNull();
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('ignora a expiração quando o gatilho é só recusa explícita', async () => {
      await expect(recusa('EXPIRED')).resolves.toBeNull();
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('conta os dois tipos quando o gatilho é DECLINED_OR_EXPIRED', async () => {
      platformSettingsService.get.mockResolvedValue({
        ...CONFIG_PADRAO,
        driverPunishmentTrigger: 'DECLINED_OR_EXPIRED',
      });

      await expect(recusa('EXPIRED')).resolves.toBeNull();
      expect(prisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { consecutiveOfferRefusals: { increment: 1 } } }),
      );
    });

    it('não pune com a regra ligada e sem quantidade ou tempo configurado', async () => {
      platformSettingsService.get.mockResolvedValue({
        ...CONFIG_PADRAO,
        driverPunishmentOfferCount: null,
      });

      await expect(recusa()).resolves.toBeNull();
      expect(prisma.driver.update).not.toHaveBeenCalled();
      expect(prisma.driverPunishment.create).not.toHaveBeenCalled();
    });

    it('não conta a recusa de quem já está com entrega em andamento', async () => {
      platformSettingsService.get.mockResolvedValue({
        ...CONFIG_PADRAO,
        driverPunishmentIgnoreWithActiveDelivery: true,
      });
      prisma.delivery.count.mockResolvedValue(1);

      await expect(recusa()).resolves.toBeNull();
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('conta normalmente com entrega em andamento quando a exceção está desligada', async () => {
      prisma.delivery.count.mockResolvedValue(1);

      await recusa();

      // Sem a excecao ligada nem consulta as entregas em andamento.
      expect(prisma.delivery.count).not.toHaveBeenCalled();
      expect(prisma.driver.update).toHaveBeenCalled();
    });

    it('não pune duas vezes pelo mesmo pedido', async () => {
      prisma.driverPunishment.findFirst.mockResolvedValueOnce({ id: 'punicao-antiga' });

      await expect(recusa()).resolves.toBeNull();
      expect(prisma.driverPunishment.findFirst).toHaveBeenCalledWith({
        where: { driverId: 'driver-1', deliveryId: 'delivery-1' },
        select: { id: true },
      });
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('permite punir de novo pelo mesmo pedido quando a exceção está desligada', async () => {
      platformSettingsService.get.mockResolvedValue({
        ...CONFIG_PADRAO,
        driverPunishmentOncePerDelivery: false,
      });

      await recusa();

      expect(prisma.driver.update).toHaveBeenCalled();
    });

    it('não empilha uma segunda punição sobre uma que ainda está valendo', async () => {
      // Primeira consulta: nenhuma punicao pelo pedido. Segunda: uma ativa.
      prisma.driverPunishment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'punicao-ativa' });

      await expect(recusa()).resolves.toBeNull();
      expect(prisma.driver.update).not.toHaveBeenCalled();
    });

    it('só conta enquanto a sequência não fecha a quantidade configurada', async () => {
      prisma.driver.update.mockResolvedValue({ consecutiveOfferRefusals: 1 });

      await expect(recusa()).resolves.toBeNull();
      expect(prisma.driverPunishment.create).not.toHaveBeenCalled();
      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('aplica a punição ao fechar a quantidade, zera a sequência e avisa o motoboy', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
      prisma.driver.update.mockResolvedValue({ consecutiveOfferRefusals: 2 });
      const criada = {
        id: 'punicao-1',
        driverId: 'driver-1',
        deliveryId: 'delivery-1',
        reason: 'DECLINED_OFFER',
        offerCount: 2,
        minutes: 40,
        appliedAt: new Date('2026-08-28T12:00:00.000Z'),
        expiresAt: new Date('2026-08-28T12:40:00.000Z'),
        revokedAt: null,
      };
      prisma.driverPunishment.create.mockResolvedValue(criada);

      const resultado = await recusa();

      expect(resultado).toBe(criada);
      expect(prisma.driverPunishment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          driverId: 'driver-1',
          deliveryId: 'delivery-1',
          reason: 'DECLINED_OFFER',
          offerCount: 2,
          minutes: 40,
          expiresAt: new Date('2026-08-28T12:40:00.000Z'),
        }),
      });
      // A ficha fica limpa: sem isto a proxima recusa puniria na hora.
      expect(prisma.driver.update).toHaveBeenLastCalledWith({
        where: { id: 'driver-1' },
        data: { consecutiveOfferRefusals: 0 },
      });
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'driver:punishment-applied',
        expect.objectContaining({ expiresAt: '2026-08-28T12:40:00.000Z', minutes: 40 }),
      );
      jest.useRealTimers();
    });

    it('grava EXPIRED_OFFER quando o motivo foi a oferta ter expirado', async () => {
      platformSettingsService.get.mockResolvedValue({
        ...CONFIG_PADRAO,
        driverPunishmentTrigger: 'EXPIRED',
      });
      prisma.driver.update.mockResolvedValue({ consecutiveOfferRefusals: 2 });
      prisma.driverPunishment.create.mockResolvedValue({
        id: 'punicao-1',
        offerCount: 2,
        minutes: 40,
        reason: 'EXPIRED_OFFER',
        appliedAt: new Date(),
        expiresAt: new Date(Date.now() + 40 * 60_000),
      });

      await recusa('EXPIRED');

      expect(prisma.driverPunishment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reason: 'EXPIRED_OFFER' }),
      });
    });
  });

  describe('registerAcceptance', () => {
    it('zera a sequência sem escrever quando ela já está zerada', async () => {
      await service.registerAcceptance('driver-1');

      expect(prisma.driver.updateMany).toHaveBeenCalledWith({
        where: { id: 'driver-1', consecutiveOfferRefusals: { gt: 0 } },
        data: { consecutiveOfferRefusals: 0 },
      });
    });
  });

  describe('punishedDriverIds', () => {
    it('devolve cada motoboy uma vez, mesmo com punições sobrepostas', async () => {
      prisma.driverPunishment.findMany.mockResolvedValue([
        { driverId: 'driver-1' },
        { driverId: 'driver-2' },
        { driverId: 'driver-1' },
      ]);

      await expect(service.punishedDriverIds()).resolves.toEqual(['driver-1', 'driver-2']);
    });
  });

  describe('revoke', () => {
    const punicaoAtiva = {
      id: 'punicao-1',
      driverId: 'driver-1',
      expiresAt: new Date(Date.now() + 30 * 60_000),
      revokedAt: null,
    };

    it('libera, audita e avisa o motoboy quando o prazo ainda estava correndo', async () => {
      prisma.driverPunishment.findUnique.mockResolvedValue(punicaoAtiva);
      prisma.driverPunishment.findUniqueOrThrow.mockResolvedValue({
        ...punicaoAtiva,
        reason: 'DECLINED_OFFER',
        offerCount: 2,
        minutes: 40,
        appliedAt: new Date(),
        revokedAt: new Date(),
        revokedReason: 'Estava sem sinal',
        revokedBy: { id: 'admin-1', name: 'Admin' },
        delivery: null,
      });

      const resultado = await service.revoke('driver-1', 'punicao-1', 'Estava sem sinal', 'admin-1');

      expect(resultado.active).toBe(false);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DRIVER_PUNISHMENT_REVOKED', entityId: 'driver-1' }),
        expect.anything(),
      );
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith(
        'driver-1',
        'driver:punishment-lifted',
        { punishmentId: 'punicao-1' },
      );
    });

    it('não avisa o motoboy ao liberar uma punição que já tinha vencido', async () => {
      const vencida = { ...punicaoAtiva, expiresAt: new Date(Date.now() - 60_000) };
      prisma.driverPunishment.findUnique.mockResolvedValue(vencida);
      prisma.driverPunishment.findUniqueOrThrow.mockResolvedValue({
        ...vencida,
        reason: 'DECLINED_OFFER',
        offerCount: 2,
        minutes: 40,
        appliedAt: new Date(),
        revokedAt: new Date(),
        revokedReason: 'Registro corrigido',
        revokedBy: { id: 'admin-1', name: 'Admin' },
        delivery: null,
      });

      await service.revoke('driver-1', 'punicao-1', 'Registro corrigido', 'admin-1');

      expect(realtimeGateway.emitToDriver).not.toHaveBeenCalled();
    });

    it('recusa uma punição de outro motoboy', async () => {
      prisma.driverPunishment.findUnique.mockResolvedValue({
        ...punicaoAtiva,
        driverId: 'driver-2',
      });

      await expect(
        service.revoke('driver-1', 'punicao-1', 'motivo qualquer', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('recusa liberar duas vezes a mesma punição', async () => {
      prisma.driverPunishment.findUnique.mockResolvedValue({
        ...punicaoAtiva,
        revokedAt: new Date(),
      });

      await expect(
        service.revoke('driver-1', 'punicao-1', 'motivo qualquer', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa a segunda liberação simultânea, que não atualiza nenhuma linha', async () => {
      prisma.driverPunishment.findUnique.mockResolvedValue(punicaoAtiva);
      prisma.driverPunishment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revoke('driver-1', 'punicao-1', 'motivo qualquer', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('listForDriver', () => {
    it('recusa listar punições de um motoboy que não existe', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.listForDriver('driver-fantasma')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('marca como ativa somente a punição não liberada e ainda no prazo', async () => {
      prisma.driverPunishment.findMany.mockResolvedValue([
        {
          id: 'punicao-1',
          reason: 'DECLINED_OFFER',
          offerCount: 2,
          minutes: 40,
          appliedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          revokedReason: null,
          revokedBy: null,
          delivery: { id: 'delivery-1', displayNumber: 42 },
        },
        {
          id: 'punicao-2',
          reason: 'EXPIRED_OFFER',
          offerCount: 3,
          minutes: 15,
          appliedAt: new Date(Date.now() - 3_600_000),
          expiresAt: new Date(Date.now() - 60_000),
          revokedAt: null,
          revokedReason: null,
          revokedBy: null,
          delivery: null,
        },
      ]);

      const resultado = await service.listForDriver('driver-1');

      expect(resultado.map((item) => item.active)).toEqual([true, false]);
      expect(resultado[0]!.delivery).toEqual({ id: 'delivery-1', displayNumber: 42 });
    });
  });
});
