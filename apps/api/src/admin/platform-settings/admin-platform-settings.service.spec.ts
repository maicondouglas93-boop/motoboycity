import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { updatePlatformSettingsSchema } from '@motoboycity/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminPlatformSettingsService } from './admin-platform-settings.service';

describe('AdminPlatformSettingsService', () => {
  let service: AdminPlatformSettingsService;
  let prisma: {
    platformSettings: { findUnique: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let financeQueue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      platformSettings: { findUnique: jest.fn(), upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    audit = { record: jest.fn() };
    financeQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPlatformSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminAuditService, useValue: audit },
        { provide: getQueueToken('finance'), useValue: financeQueue },
      ],
    }).compile();

    service = module.get(AdminPlatformSettingsService);
  });

  describe('contrato de desligamento', () => {
    it.each([
      { pickupAssignmentTimeoutMinutes: null },
      { collectionProximityRadiusMeters: null },
      { returnProximityRadiusMeters: null },
      { deliveryProximityRadiusMeters: null },
      { maxConcurrentDeliveriesPerDriver: null },
    ])('aceita null somente como intencao explicita de desligar: %o', (payload) => {
      expect(updatePlatformSettingsSchema.safeParse(payload).success).toBe(true);
    });

    it.each([
      { dispatchOfferTimeoutSeconds: null },
      { driverCommissionPercentage: null },
      // Aqui o nulo nao desligaria uma regra: deixaria o preco sair de uma
      // triangulacao de antena a quilometros do cliente.
      { deferredDestinationMaxAccuracyMeters: null },
    ])('continua recusando null em configuracao obrigatoria: %o', (payload) => {
      expect(updatePlatformSettingsSchema.safeParse(payload).success).toBe(false);
    });

    it('continua recusando payload vazio', () => {
      expect(updatePlatformSettingsSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('get', () => {
    it('retorna tudo null quando ainda não foi configurado', async () => {
      prisma.platformSettings.findUnique.mockResolvedValue(null);

      const result = await service.get();

      expect(result).toEqual({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        aiqfomeDispatchDelayMinutes: null,
        pickupAssignmentTimeoutMinutes: null,
        collectionProximityRadiusMeters: null,
        returnProximityRadiusMeters: null,
        businessHoursEnabled: false,
        minMinutesBeforeCollect: null,
        minMinutesBeforeDeliver: null,
        locationSilenceAlertMinutes: null,
        slaAlertMinutesToAccept: null,
        slaAlertMinutesToCollect: null,
        slaAlertMinutesToDeliver: null,
        /**
         * O único que NÃO nasce nulo, e de propósito: 1 é segunda-feira, a
         * regra fixa que existia antes de o dia do saque virar configuração.
         * Nulo aqui significaria "qualquer dia", e uma instalação que nunca
         * configurou nada passaria a aceitar saque todo dia — mudança de
         * comportamento escondida numa migration.
         */
        withdrawalWeekday: 1,
        maxConcurrentDeliveriesPerDriver: null,
        maxDeliveriesPerBatch: null,
        deliveryProximityRadiusMeters: null,
        deferredDestinationMaxAccuracyMeters: null,
        driverPunishmentEnabled: false,
        driverPunishmentTrigger: 'DECLINED',
        driverPunishmentOfferCount: null,
        driverPunishmentMinutes: null,
        driverPunishmentIgnoreWithActiveDelivery: false,
        driverPunishmentOncePerDelivery: true,
        updatedBy: null,
        updatedAt: null,
      });
    });

    it('atualizar só o raio não mexe nos tempos mínimos', async () => {
      // Mesmo cuidado que a hora de funcionamento ja exigiu: um upsert que
      // escreve campo ausente apagaria configuracao que ninguem pediu para
      // mudar.
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        returnProximityRadiusMeters: 200,
        businessHoursEnabled: false,
        minMinutesBeforeCollect: 2,
        minMinutesBeforeDeliver: 5,
        locationSilenceAlertMinutes: null,
        slaAlertMinutesToAccept: null,
        slaAlertMinutesToCollect: null,
        slaAlertMinutesToDeliver: null,
        /**
         * O único que NÃO nasce nulo, e de propósito: 1 é segunda-feira, a
         * regra fixa que existia antes de o dia do saque virar configuração.
         * Nulo aqui significaria "qualquer dia", e uma instalação que nunca
         * configurou nada passaria a aceitar saque todo dia — mudança de
         * comportamento escondida numa migration.
         */
        withdrawalWeekday: 1,
        maxConcurrentDeliveriesPerDriver: null,
        maxDeliveriesPerBatch: null,
        deliveryProximityRadiusMeters: null,
        updatedBy: null,
        updatedAt: new Date('2026-08-23T12:00:00.000Z'),
      });

      await service.update({ returnProximityRadiusMeters: 200 }, 'user-1');

      const update = prisma.platformSettings.upsert.mock.calls[0]?.[0]?.update;
      expect(update).not.toHaveProperty('minMinutesBeforeCollect');
      expect(update).not.toHaveProperty('minMinutesBeforeDeliver');
    });

    it('converte Decimal para number, repassa o timeout/raio e inclui quem atualizou', async () => {
      prisma.platformSettings.findUnique.mockResolvedValue({
        driverCommissionPercentage: { toString: () => '80.00' },
        dispatchOfferTimeoutSeconds: 60,
        returnProximityRadiusMeters: 200,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.get();

      expect(result).toEqual({
        driverCommissionPercentage: 80,
        dispatchOfferTimeoutSeconds: 60,
        returnProximityRadiusMeters: 200,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('update', () => {
    it('aciona a reconciliação dos repasses quando muda o dia financeiro', async () => {
      const updatedAt = new Date('2026-08-31T20:00:00.000Z');
      prisma.platformSettings.upsert.mockResolvedValue({
        withdrawalWeekday: 0,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt,
      });

      await service.update({ withdrawalWeekday: 0 }, 'admin-1');

      expect(financeQueue.add).toHaveBeenCalledWith(
        'release-driver-repasses',
        { reason: 'platform-weekday-changed' },
        expect.objectContaining({ jobId: `repasse-policy-${updatedAt.getTime()}` }),
      );
    });

    it('não falha depois de salvar se o gatilho imediato ficar sem Redis', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        withdrawalWeekday: 6,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-08-31T20:00:00.000Z'),
      });
      financeQueue.add.mockRejectedValue(new Error('redis fora'));

      await expect(service.update({ withdrawalWeekday: 6 }, 'admin-1')).resolves.toMatchObject({
        withdrawalWeekday: 6,
      });
    });

    it('faz upsert gravando quem atualizou, com os dois campos', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: { toString: () => '75.00' },
        dispatchOfferTimeoutSeconds: 90,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.update(
        { driverCommissionPercentage: 75, dispatchOfferTimeoutSeconds: 90 },
        'admin-1',
      );

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        update: {
          driverCommissionPercentage: 75,
          dispatchOfferTimeoutSeconds: 90,
          updatedByUserId: 'admin-1',
        },
        create: {
          id: 'global',
          driverCommissionPercentage: 75,
          dispatchOfferTimeoutSeconds: 90,
          updatedByUserId: 'admin-1',
        },
        include: { updatedBy: true },
      });
      expect(result).toEqual({
        driverCommissionPercentage: 75,
        dispatchOfferTimeoutSeconds: 90,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    /**
     * `null` desliga; ausente mantem. A distincao e o que devolve ao
     * administrador o interruptor de emergencia: antes, um raio configurado
     * nao tinha caminho de volta pelo painel, porque campo vazio significava
     * "mantenha como esta" e o contrato recusava `null`.
     */
    it('grava null nos cinco campos desligaveis, sem tocar nos outros', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        returnProximityRadiusMeters: null,
        collectionProximityRadiusMeters: null,
        deliveryProximityRadiusMeters: null,
        pickupAssignmentTimeoutMinutes: null,
        maxConcurrentDeliveriesPerDriver: null,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await service.update(
        {
          returnProximityRadiusMeters: null,
          collectionProximityRadiusMeters: null,
          deliveryProximityRadiusMeters: null,
          pickupAssignmentTimeoutMinutes: null,
          maxConcurrentDeliveriesPerDriver: null,
        },
        'admin-1',
      );

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            returnProximityRadiusMeters: null,
            collectionProximityRadiusMeters: null,
            deliveryProximityRadiusMeters: null,
            pickupAssignmentTimeoutMinutes: null,
            maxConcurrentDeliveriesPerDriver: null,
            updatedByUserId: 'admin-1',
          },
        }),
      );
    });

    it('atualiza só o campo informado (partial update)', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: 45,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await service.update({ dispatchOfferTimeoutSeconds: 45 }, 'admin-1');

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        update: { dispatchOfferTimeoutSeconds: 45, updatedByUserId: 'admin-1' },
        create: {
          id: 'global',
          dispatchOfferTimeoutSeconds: 45,
          updatedByUserId: 'admin-1',
        },
        include: { updatedBy: true },
      });
    });

    it('atualiza só o raio de retorno (partial update)', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        returnProximityRadiusMeters: 150,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.update({ returnProximityRadiusMeters: 150 }, 'admin-1');

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        update: { returnProximityRadiusMeters: 150, updatedByUserId: 'admin-1' },
        create: {
          id: 'global',
          returnProximityRadiusMeters: 150,
          updatedByUserId: 'admin-1',
        },
        include: { updatedBy: true },
      });
      expect(result.returnProximityRadiusMeters).toBe(150);
    });

    it('atualiza só o raio de coleta (partial update)', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        collectionProximityRadiusMeters: 180,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.update({ collectionProximityRadiusMeters: 180 }, 'admin-1');

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'global' },
        update: { collectionProximityRadiusMeters: 180, updatedByUserId: 'admin-1' },
        create: {
          id: 'global',
          collectionProximityRadiusMeters: 180,
          updatedByUserId: 'admin-1',
        },
        include: { updatedBy: true },
      });
      expect(result.collectionProximityRadiusMeters).toBe(180);
    });

    it('atualiza o prazo de coleta sem alterar o alerta visual de coleta', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: 60,
        pickupAssignmentTimeoutMinutes: 20,
        returnProximityRadiusMeters: null,
        businessHoursEnabled: false,
        minMinutesBeforeCollect: null,
        minMinutesBeforeDeliver: null,
        locationSilenceAlertMinutes: null,
        slaAlertMinutesToAccept: null,
        slaAlertMinutesToCollect: 30,
        slaAlertMinutesToDeliver: null,
        /**
         * O único que NÃO nasce nulo, e de propósito: 1 é segunda-feira, a
         * regra fixa que existia antes de o dia do saque virar configuração.
         * Nulo aqui significaria "qualquer dia", e uma instalação que nunca
         * configurou nada passaria a aceitar saque todo dia — mudança de
         * comportamento escondida numa migration.
         */
        withdrawalWeekday: 1,
        maxConcurrentDeliveriesPerDriver: null,
        maxDeliveriesPerBatch: null,
        deliveryProximityRadiusMeters: null,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-08-27T12:00:00.000Z'),
      });

      await service.update({ pickupAssignmentTimeoutMinutes: 20 }, 'admin-1');

      const update = prisma.platformSettings.upsert.mock.calls[0]?.[0]?.update;
      expect(update).toEqual({
        pickupAssignmentTimeoutMinutes: 20,
        updatedByUserId: 'admin-1',
      });
      expect(update).not.toHaveProperty('slaAlertMinutesToCollect');
    });

    it('preserva os limites de capacidade na criação inicial e audita os campos alterados', async () => {
      prisma.platformSettings.upsert.mockResolvedValue({
        driverCommissionPercentage: null,
        dispatchOfferTimeoutSeconds: null,
        returnProximityRadiusMeters: null,
        businessHoursEnabled: false,
        minMinutesBeforeCollect: null,
        minMinutesBeforeDeliver: null,
        locationSilenceAlertMinutes: null,
        slaAlertMinutesToAccept: null,
        slaAlertMinutesToCollect: null,
        slaAlertMinutesToDeliver: null,
        /**
         * O único que NÃO nasce nulo, e de propósito: 1 é segunda-feira, a
         * regra fixa que existia antes de o dia do saque virar configuração.
         * Nulo aqui significaria "qualquer dia", e uma instalação que nunca
         * configurou nada passaria a aceitar saque todo dia — mudança de
         * comportamento escondida numa migration.
         */
        withdrawalWeekday: 1,
        maxConcurrentDeliveriesPerDriver: 3,
        maxDeliveriesPerBatch: 8,
        deliveryProximityRadiusMeters: 120,
        updatedBy: { id: 'admin-1', name: 'Admin Um' },
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const payload = {
        maxConcurrentDeliveriesPerDriver: 3,
        maxDeliveriesPerBatch: 8,
        deliveryProximityRadiusMeters: 120,
      };
      const result = await service.update(payload, 'admin-1');

      expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            id: 'global',
            ...payload,
            updatedByUserId: 'admin-1',
          },
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'admin-1',
          action: 'PLATFORM_SETTINGS_UPDATED',
          entityType: 'PLATFORM_SETTINGS',
          entityId: 'global',
          metadata: { changedFields: Object.keys(payload) },
        }),
        prisma,
      );
      expect(result.maxConcurrentDeliveriesPerDriver).toBe(3);
      expect(result.maxDeliveriesPerBatch).toBe(8);
      expect(result.deliveryProximityRadiusMeters).toBe(120);
    });
  });
});
