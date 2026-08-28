import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { AdminPlatformSettingsService } from '../admin/platform-settings/admin-platform-settings.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { GoogleMapsApiError, GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { PricingService } from '../pricing/pricing.service';
import { ReturnNotSupportedError } from '../pricing/pricing-calculator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { IntegrationOutboxRecorder } from '../integrations/integration-outbox-recorder.service';
import { DeliveriesService } from './deliveries.service';

const companyUser = { id: 'user-company-1', type: 'COMPANY_MEMBER' } as User;
const otherCompanyUser = { id: 'user-company-2', type: 'COMPANY_MEMBER' } as User;
const adminUser = { id: 'user-admin-1', type: 'ADMIN' } as User;
const driverUser = { id: 'user-driver-1', type: 'DRIVER' } as User;

const driverRow = { id: 'driver-1', userId: driverUser.id };

const pickupAddress = {
  id: 'addr-1',
  companyId: 'company-1',
  street: 'Rua da Loja',
  number: '100',
  complement: null,
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  lat: null,
  lng: null,
  isPrimary: true,
};

const dropoffPayload = {
  street: 'Rua do Cliente',
  number: '200',
  complement: undefined,
  city: 'Lajinha',
  state: 'MG',
  zip: '36930000',
  referenceNote: undefined,
};

const idempotencySinglePayload = {
  serviceTypeId: 'st-1',
  destinationKnownAtCreation: true,
  dropoffAddress: dropoffPayload,
  requiresReturn: false,
  requiresDeliveryProof: false,
  requiresCollectionRecipient: false,
  pickupSurchargeChargedToDriver: false,
};

const idempotencyBatchPayload = {
  deliveries: [
    idempotencySinglePayload,
    { ...idempotencySinglePayload, dropoffAddress: { ...dropoffPayload, number: '201' } },
  ],
};

function fullDeliveryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'delivery-1',
    displayNumber: 1,
    companyId: 'company-1',
    serviceTypeId: 'st-1',
    driverId: null,
    company: { tradeName: 'Loja Teste', regionId: 'region-1' },
    serviceType: { name: 'Moto' },
    status: 'AWAITING_DRIVER',
    destinationKnownAtCreation: true,
    distanceKm: { toString: () => '5.00' },
    totalValue: { toString: () => '12.50' },
    driverValue: { toString: () => '10.00' },
    platformValue: { toString: () => '2.50' },
    requiresReturn: false,
    returnValue: null,
    failedAt: null,
    failureReason: null,
    failureNote: null,
    paymentMethod: 'BILLED',
    recipientName: null,
    recipientPhone: null,
    externalOrderNumber: null,
    driverNote: null,
    customerPaymentMethod: null,
    statusChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    scheduledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    addresses: [
      {
        type: 'PICKUP',
        street: pickupAddress.street,
        number: pickupAddress.number,
        complement: null,
        city: pickupAddress.city,
        state: pickupAddress.state,
        zip: pickupAddress.zip,
        lat: null,
        lng: null,
        referenceNote: null,
      },
      {
        type: 'DROPOFF',
        street: dropoffPayload.street,
        number: dropoffPayload.number,
        complement: null,
        city: dropoffPayload.city,
        state: dropoffPayload.state,
        zip: dropoffPayload.zip,
        lat: null,
        lng: null,
        referenceNote: null,
      },
    ],
    statusHistory: [],
    driver: null,
    invoice: null,
    ...overrides,
  };
}

describe('DeliveriesService', () => {
  let service: DeliveriesService;
  let prisma: {
    company: { findUnique: jest.Mock };
    companyTeamMember: { findFirst: jest.Mock };
    companyAddress: { findFirst: jest.Mock };
    companyCustomer: { findUnique: jest.Mock; findMany: jest.Mock };
    deliveryAddress: { findFirst: jest.Mock; updateMany: jest.Mock };
    businessHour: { findMany: jest.Mock };
    delivery: {
      aggregate: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      groupBy: jest.Mock;
    };
    driver: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let pricingService: { quote: jest.Mock };
  let googleMapsService: { getDistance: jest.Mock; reverseGeocode: jest.Mock };
  let dispatchService: {
    assertConfigured: jest.Mock;
    dispatchDelivery: jest.Mock;
    scheduleActivation: jest.Mock;
    cancelPendingOfferForDelivery: jest.Mock;
    cancelScheduledActivation: jest.Mock;
  };
  let platformSettingsService: { get: jest.Mock };
  let financeLedgerService: { creditDriverRepasse: jest.Mock };
  let realtimeGateway: {
    emitToDriver: jest.Mock;
    emitDeliveryUpdated: jest.Mock;
    emitAdminActivity: jest.Mock;
  };
  let tx: {
    delivery: { create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    deliveryAddress: { createMany: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      delivery: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deliveryAddress: { createMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      deliveryStatusHistory: { create: jest.fn() },
    };
    prisma = {
      company: { findUnique: jest.fn() },
      companyTeamMember: { findFirst: jest.fn() },
      companyAddress: { findFirst: jest.fn() },
      companyCustomer: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      /** Enderecos antigos podem nao ter coordenada; a operacao deve tolerar. */
      deliveryAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // Sem horario configurado: a operacao esta sempre aberta, que e o estado
      // padrao de quem nunca mexeu nisso.
      businessHour: { findMany: jest.fn().mockResolvedValue([]) },
      delivery: {
        aggregate: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    pricingService = { quote: jest.fn() };
    googleMapsService = {
      getDistance: jest.fn(),
      reverseGeocode: jest.fn().mockResolvedValue(null),
    };
    dispatchService = {
      assertConfigured: jest.fn().mockResolvedValue(undefined),
      dispatchDelivery: jest.fn().mockResolvedValue(undefined),
      scheduleActivation: jest.fn().mockResolvedValue(undefined),
      cancelPendingOfferForDelivery: jest.fn().mockResolvedValue(undefined),
      cancelScheduledActivation: jest.fn().mockResolvedValue(undefined),
    };
    platformSettingsService = { get: jest.fn() };
    // Padrao do ambiente: bloqueio de horario desligado. Os testes que precisam
    // de outro valor sobrescrevem, e os que nao precisam nao deviam quebrar por
    // causa dele.
    platformSettingsService.get.mockResolvedValue({ businessHoursEnabled: false });
    financeLedgerService = { creditDriverRepasse: jest.fn().mockResolvedValue(undefined) };
    realtimeGateway = {
      emitToDriver: jest.fn(),
      emitDeliveryUpdated: jest.fn(),
      emitAdminActivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricingService, useValue: pricingService },
        { provide: GoogleMapsService, useValue: googleMapsService },
        { provide: DispatchService, useValue: dispatchService },
        { provide: FinanceLedgerService, useValue: financeLedgerService },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: IntegrationOutboxRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(DeliveriesService);
  });

  function mockCompanyMembership(userId: string, companyId: string, status = 'ACTIVE') {
    prisma.companyTeamMember.findFirst.mockImplementation(
      ({ where }: { where: { userId: string } }) =>
        where.userId === userId
          ? { company: { id: companyId, status, regionId: 'region-1' } }
          : null,
    );
  }

  describe('create', () => {
    const payload = {
      serviceTypeId: 'st-1',
      destinationKnownAtCreation: true,
      dropoffAddress: dropoffPayload,
      requiresReturn: false,
      requiresDeliveryProof: false,
      requiresCollectionRecipient: false,
      pickupSurchargeChargedToDriver: false,
    };

    beforeEach(() => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
      pricingService.quote.mockResolvedValue({
        distanceFee: 7.5,
        subtotal: 12.5,
        returnValue: 0,
        totalValue: 12.5,
        driverValue: 10,
        platformValue: 2.5,
      });
      tx.delivery.create.mockResolvedValue({ id: 'delivery-1' });
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow());
    });

    it('cria o pedido com valores calculados e status AWAITING_DRIVER quando não agendado', async () => {
      const result = await service.create(companyUser, payload);

      expect(googleMapsService.getDistance).toHaveBeenCalledWith({
        origin: { address: expect.stringContaining('Rua da Loja') },
        destination: { address: expect.stringContaining('Rua do Cliente') },
      });
      expect(pricingService.quote).toHaveBeenCalledWith({
        companyId: 'company-1',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        distanceKm: 5,
        requiresReturn: false,
      });
      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'AWAITING_DRIVER',
            paymentMethod: 'BILLED',
            totalValue: 12.5,
            driverValue: 10,
            platformValue: 2.5,
          }),
        }),
      );
      expect(tx.deliveryAddress.createMany).toHaveBeenCalled();
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: null,
          toStatus: 'AWAITING_DRIVER',
          changedByUserId: companyUser.id,
        },
      });
      expect(result.id).toBe('delivery-1');
      expect(dispatchService.assertConfigured).toHaveBeenCalled();
      expect(dispatchService.dispatchDelivery).toHaveBeenCalledWith('delivery-1');
      expect(dispatchService.scheduleActivation).not.toHaveBeenCalled();
    });

    it('usa status SCHEDULED quando scheduledAt é informado e agenda a ativação em vez de despachar', async () => {
      await service.create(companyUser, { ...payload, scheduledAt: '2026-12-01T10:00:00.000Z' });

      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
      );
      expect(dispatchService.assertConfigured).not.toHaveBeenCalled();
      expect(dispatchService.dispatchDelivery).not.toHaveBeenCalled();
      expect(dispatchService.scheduleActivation).toHaveBeenCalledWith(
        'delivery-1',
        new Date('2026-12-01T10:00:00.000Z'),
      );
    });

    it('vincula a entrega ao cliente cadastrado pelo telefone normalizado', async () => {
      prisma.companyCustomer.findUnique.mockResolvedValue({ id: 'customer-1' });

      await service.create(companyUser, {
        ...payload,
        recipientPhone: '+55 (33) 99999-9991',
      });

      expect(prisma.companyCustomer.findUnique).toHaveBeenCalledWith({
        where: { companyId_phone: { companyId: 'company-1', phone: '33999999991' } },
        select: { id: true },
      });
      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyCustomerId: 'customer-1' }),
        }),
      );
    });

    it('congela returnValue quando requiresReturn e a cotação retorna valor de retorno', async () => {
      pricingService.quote.mockResolvedValue({
        distanceFee: 7.5,
        subtotal: 12.5,
        returnValue: 3,
        totalValue: 15.5,
        driverValue: 13,
        platformValue: 2.5,
      });

      await service.create(companyUser, { ...payload, requiresReturn: true });

      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requiresReturn: true, returnValue: 3 }),
        }),
      );
    });

    it('rejeita quando o usuário não está vinculado a uma empresa', async () => {
      mockCompanyMembership('outro-user', 'company-x');

      await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita quando a empresa não está ACTIVE', async () => {
      mockCompanyMembership(companyUser.id, 'company-1', 'PENDING_APPROVAL');

      await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita quando a empresa não tem endereço de coleta cadastrado', async () => {
      prisma.companyAddress.findFirst.mockResolvedValue(null);

      await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(ConflictException);
    });

    it('traduz GoogleMapsNotConfiguredError em InternalServerErrorException', async () => {
      googleMapsService.getDistance.mockRejectedValue(new GoogleMapsNotConfiguredError());

      await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('traduz outros erros do Maps em ServiceUnavailableException', async () => {
      googleMapsService.getDistance.mockRejectedValue(new GoogleMapsApiError('falhou'));

      await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('propaga o erro quando o despacho ainda não está configurado', async () => {
      dispatchService.assertConfigured.mockRejectedValue(new ConflictException('não configurado'));

      await expect(service.create(companyUser, payload)).rejects.toBeInstanceOf(ConflictException);
      expect(tx.delivery.create).not.toHaveBeenCalled();
    });

    it('sem destino conhecido: não calcula distância/preço e cria só o endereço PICKUP', async () => {
      const noAddressPayload = {
        serviceTypeId: 'st-1',
        destinationKnownAtCreation: false,
        requiresReturn: false,
        requiresDeliveryProof: false,
        requiresCollectionRecipient: false,
        pickupSurchargeChargedToDriver: false,
      };

      await service.create(companyUser, noAddressPayload);

      expect(googleMapsService.getDistance).not.toHaveBeenCalled();
      expect(pricingService.quote).not.toHaveBeenCalled();
      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            destinationKnownAtCreation: false,
            distanceKm: null,
            totalValue: null,
            driverValue: null,
            platformValue: null,
            returnValue: null,
          }),
        }),
      );
      expect(tx.deliveryAddress.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ type: 'PICKUP' })],
      });
    });
  });

  it('repetir a mesma chave retoma o despacho sem criar outro pedido', async () => {
    mockCompanyMembership(companyUser.id, 'company-1');
    prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
    googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
    pricingService.quote.mockResolvedValue({
      distanceFee: 7.5,
      subtotal: 12.5,
      returnValue: 0,
      totalValue: 12.5,
      driverValue: 10,
      platformValue: 2.5,
    });
    const keyedPayload = {
      ...idempotencySinglePayload,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    };
    let createdId: string | null = null;
    tx.delivery.create.mockImplementation(({ data }: { data: { id: string } }) => {
      createdId = data.id;
      return Promise.resolve({ id: data.id });
    });
    prisma.delivery.findUnique.mockImplementation(
      ({ where, select }: { where: { id: string }; select?: unknown }) => {
        if (select && !createdId) return Promise.resolve(null);
        if (select) {
          return Promise.resolve({
            id: where.id,
            companyId: 'company-1',
            status: 'AWAITING_DRIVER',
            scheduledAt: null,
          });
        }
        return Promise.resolve(fullDeliveryRow({ id: where.id }));
      },
    );
    dispatchService.dispatchDelivery
      .mockRejectedValueOnce(new Error('resposta perdida depois do commit'))
      .mockResolvedValueOnce(undefined);

    await expect(service.create(companyUser, keyedPayload)).rejects.toThrow(
      'resposta perdida depois do commit',
    );
    const retried = await service.create(companyUser, keyedPayload);

    expect(createdId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(retried.id).toBe(createdId);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.delivery.create).toHaveBeenCalledTimes(1);
    expect(googleMapsService.getDistance).toHaveBeenCalledTimes(1);
    expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(dispatchService.dispatchDelivery).toHaveBeenCalledTimes(2);
  });

  it('repeticao de pedido agendado recoloca o mesmo job sem recriar o pedido', async () => {
    mockCompanyMembership(companyUser.id, 'company-1');
    const scheduledAt = new Date('2026-12-01T10:00:00.000Z');
    prisma.delivery.findUnique.mockImplementation(
      ({ where, select }: { where: { id: string }; select?: unknown }) =>
        Promise.resolve(
          select
            ? {
                id: where.id,
                companyId: 'company-1',
                status: 'SCHEDULED',
                scheduledAt,
              }
            : fullDeliveryRow({ id: where.id, status: 'SCHEDULED', scheduledAt }),
        ),
    );

    await service.create(companyUser, {
      ...idempotencySinglePayload,
      scheduledAt: scheduledAt.toISOString(),
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(googleMapsService.getDistance).not.toHaveBeenCalled();
    expect(dispatchService.scheduleActivation).toHaveBeenCalledWith(
      expect.any(String),
      scheduledAt,
    );
  });

  it('uma colisao concorrente devolve o pedido vencedor em vez de falhar', async () => {
    mockCompanyMembership(companyUser.id, 'company-1');
    prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
    googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
    pricingService.quote.mockResolvedValue({
      distanceFee: 7.5,
      subtotal: 12.5,
      returnValue: 0,
      totalValue: 12.5,
      driverValue: 10,
      platformValue: 2.5,
    });
    let winnerId: string | null = null;
    tx.delivery.create.mockImplementation(({ data }: { data: { id: string } }) => {
      winnerId = data.id;
      return Promise.resolve({ id: data.id });
    });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      await callback(tx);
      throw { code: 'P2002' };
    });
    prisma.delivery.findUnique.mockImplementation(
      ({ where, select }: { where: { id: string }; select?: unknown }) => {
        if (select && !winnerId) return Promise.resolve(null);
        return Promise.resolve(
          select
            ? {
                id: where.id,
                companyId: 'company-1',
                status: 'AWAITING_DRIVER',
                scheduledAt: null,
              }
            : fullDeliveryRow({ id: where.id }),
        );
      },
    );

    const result = await service.create(companyUser, {
      ...idempotencySinglePayload,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });

    expect(result.id).toBe(winnerId);
    expect(dispatchService.dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.emitDeliveryUpdated).not.toHaveBeenCalled();
  });

  describe('createForCompany', () => {
    const payload = {
      serviceTypeId: 'st-1',
      destinationKnownAtCreation: true,
      dropoffAddress: dropoffPayload,
      requiresReturn: false,
      requiresDeliveryProof: false,
      requiresCollectionRecipient: false,
      pickupSurchargeChargedToDriver: false,
    };

    beforeEach(() => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'company-2',
        status: 'ACTIVE',
        regionId: 'region-2',
      });
      prisma.companyAddress.findFirst.mockResolvedValue({
        ...pickupAddress,
        id: 'addr-2',
        companyId: 'company-2',
      });
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
      pricingService.quote.mockResolvedValue({
        distanceFee: 7.5,
        subtotal: 12.5,
        returnValue: 0,
        totalValue: 12.5,
        driverValue: 10,
        platformValue: 2.5,
      });
      tx.delivery.create.mockResolvedValue({ id: 'delivery-1' });
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          companyId: 'company-2',
          company: { tradeName: 'Empresa Escolhida', regionId: 'region-2' },
        }),
      );
    });

    it('usa a empresa selecionada no preco, no pedido e no historico do admin', async () => {
      await service.createForCompany(adminUser, 'company-2', payload);

      expect(prisma.company.findUnique).toHaveBeenCalledWith({
        where: { id: 'company-2' },
        select: { id: true, status: true, regionId: true },
      });
      expect(pricingService.quote).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-2', regionId: 'region-2' }),
      );
      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'company-2' }) }),
      );
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: null,
          toStatus: 'AWAITING_DRIVER',
          changedByUserId: adminUser.id,
        },
      });
      expect(prisma.companyTeamMember.findFirst).not.toHaveBeenCalled();
    });

    it('recusa empresa inexistente ou nao ativa', async () => {
      prisma.company.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'company-2',
        status: 'SUSPENDED',
        regionId: 'region-2',
      });

      await expect(
        service.createForCompany(adminUser, 'company-2', payload),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createForCompany(adminUser, 'company-2', payload),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.delivery.create).not.toHaveBeenCalled();
    });

    it('recusa usuario que nao seja administrador', async () => {
      await expect(
        service.createForCompany(companyUser, 'company-2', payload),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateBeforeAcceptance', () => {
    const payload = {
      serviceTypeId: 'st-2',
      destinationKnownAtCreation: true,
      dropoffAddress: { ...dropoffPayload, number: '250' },
      requiresReturn: true,
      requiresDeliveryProof: true,
      requiresCollectionRecipient: false,
      pickupSurchargeChargedToDriver: false,
    };

    it('recalcula rota e preco, preservando autor e trilha antes do aceite', async () => {
      prisma.delivery.findUnique
        .mockResolvedValueOnce({
          id: 'delivery-1',
          batchId: null,
          status: 'SCHEDULED',
          company: { id: 'company-1', status: 'ACTIVE', regionId: 'region-1' },
          addresses: [{ ...pickupAddress, type: 'PICKUP' }],
          offers: [],
        })
        .mockResolvedValueOnce(
          fullDeliveryRow({
            serviceType: { id: 'st-2', name: 'Moto expressa' },
            requiresReturn: true,
            requiresDeliveryProof: true,
            requiresCollectionRecipient: false,
            pickupSurchargeChargedToDriver: false,
          }),
        );
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 7, durationMinutes: 25 });
      pricingService.quote.mockResolvedValue({
        distanceFee: 10,
        subtotal: 16,
        returnValue: 4,
        totalValue: 20,
        driverValue: 16,
        platformValue: 4,
        surchargeLabel: null,
        surchargeValue: 0,
      });

      await service.updateBeforeAcceptance(adminUser, 'delivery-1', payload);

      expect(dispatchService.cancelScheduledActivation).toHaveBeenCalledWith('delivery-1');
      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'delivery-1',
            status: 'SCHEDULED',
            offers: { none: { response: 'PENDING' } },
          },
          data: expect.objectContaining({
            serviceTypeId: 'st-2',
            status: 'AWAITING_DRIVER',
            distanceKm: 7,
            totalValue: 20,
            requiresReturn: true,
          }),
        }),
      );
      expect(tx.deliveryAddress.deleteMany).toHaveBeenCalledWith({
        where: { deliveryId: 'delivery-1', type: 'DROPOFF' },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'delivery-1',
          fromStatus: 'SCHEDULED',
          toStatus: 'AWAITING_DRIVER',
          changedByUserId: adminUser.id,
        }),
      });
      expect(dispatchService.dispatchDelivery).toHaveBeenCalledWith('delivery-1');
    });

    it('bloqueia lote e oferta que ja esta aguardando resposta', async () => {
      prisma.delivery.findUnique
        .mockResolvedValueOnce({
          id: 'delivery-1',
          batchId: 'batch-1',
          status: 'SCHEDULED',
          company: { id: 'company-1', status: 'ACTIVE', regionId: 'region-1' },
          addresses: [],
          offers: [],
        })
        .mockResolvedValueOnce({
          id: 'delivery-1',
          batchId: null,
          status: 'AWAITING_DRIVER',
          company: { id: 'company-1', status: 'ACTIVE', regionId: 'region-1' },
          addresses: [],
          offers: [{ id: 'offer-1' }],
        });

      await expect(
        service.updateBeforeAcceptance(adminUser, 'delivery-1', payload),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.updateBeforeAcceptance(adminUser, 'delivery-1', payload),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.delivery.update).not.toHaveBeenCalled();
    });

    it('interrompe a edicao se o pedido mudar ou receber oferta durante o calculo', async () => {
      prisma.delivery.findUnique.mockResolvedValueOnce({
        id: 'delivery-1',
        batchId: null,
        status: 'AWAITING_DRIVER',
        company: { id: 'company-1', status: 'ACTIVE', regionId: 'region-1' },
        addresses: [{ ...pickupAddress, type: 'PICKUP' }],
        offers: [],
      });
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 7, durationMinutes: 25 });
      pricingService.quote.mockResolvedValue({
        distanceFee: 10,
        subtotal: 16,
        returnValue: 4,
        totalValue: 20,
        driverValue: 16,
        platformValue: 4,
        surchargeLabel: null,
        surchargeValue: 0,
      });
      tx.delivery.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.updateBeforeAcceptance(adminUser, 'delivery-1', payload),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.deliveryAddress.deleteMany).not.toHaveBeenCalled();
      expect(dispatchService.dispatchDelivery).not.toHaveBeenCalled();
    });
  });

  describe('createBatch', () => {
    const payload = {
      deliveries: [
        {
          serviceTypeId: 'st-1',
          destinationKnownAtCreation: true,
          dropoffAddress: dropoffPayload,
          requiresReturn: false,
          requiresDeliveryProof: false,
          requiresCollectionRecipient: false,
          pickupSurchargeChargedToDriver: false,
        },
        {
          serviceTypeId: 'st-1',
          destinationKnownAtCreation: true,
          dropoffAddress: { ...dropoffPayload, number: '201' },
          requiresReturn: true,
          requiresDeliveryProof: false,
          requiresCollectionRecipient: false,
          pickupSurchargeChargedToDriver: false,
        },
      ],
    };

    beforeEach(() => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
      pricingService.quote.mockResolvedValue({
        distanceFee: 7.5,
        subtotal: 12.5,
        returnValue: 0,
        totalValue: 12.5,
        driverValue: 10,
        platformValue: 2.5,
      });
      tx.delivery.create
        .mockResolvedValueOnce({ id: 'delivery-1' })
        .mockResolvedValueOnce({ id: 'delivery-2' });
      prisma.delivery.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(fullDeliveryRow({ id: where.id, batchId: 'batch-id' })),
      );
    });

    it('recusa o lote quando o admin desligou o lançamento em lote', async () => {
      // 1 significa "um pedido por vez". A mensagem precisa dizer isso, senao a
      // loja fica tentando adivinhar quantos cabem.
      platformSettingsService.get.mockResolvedValue({
        businessHoursEnabled: false,
        maxDeliveriesPerBatch: 1,
      });

      await expect(service.createBatch(companyUser, payload)).rejects.toMatchObject({
        message: 'O lançamento em lote está desativado. Lance um pedido por vez.',
      });
      expect(tx.delivery.create).not.toHaveBeenCalled();
    });

    it('recusa o lote maior que o teto configurado, dizendo o limite', async () => {
      platformSettingsService.get.mockResolvedValue({
        businessHoursEnabled: false,
        maxDeliveriesPerBatch: 1,
      });

      await expect(service.createBatch(companyUser, payload)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('aceita o lote quando cabe no teto configurado', async () => {
      platformSettingsService.get.mockResolvedValue({
        businessHoursEnabled: false,
        maxDeliveriesPerBatch: 2,
      });

      const result = await service.createBatch(companyUser, payload);

      expect(result.deliveries).toHaveLength(2);
    });

    it('cria todas as entregas no mesmo batchId e dispara uma única chamada de despacho', async () => {
      const result = await service.createBatch(companyUser, payload);

      expect(result.deliveries).toHaveLength(2);
      expect(result.batchId).toEqual(expect.any(String));
      expect(tx.delivery.create).toHaveBeenCalledTimes(2);
      const firstBatchId = tx.delivery.create.mock.calls[0][0].data.batchId;
      const secondBatchId = tx.delivery.create.mock.calls[1][0].data.batchId;
      expect(firstBatchId).toBe(result.batchId);
      expect(secondBatchId).toBe(result.batchId);
      expect(dispatchService.dispatchDelivery).toHaveBeenCalledTimes(1);
      expect(dispatchService.dispatchDelivery).toHaveBeenCalledWith('delivery-1');
    });

    it('sem destino conhecido: nenhum item calcula distância/preço na criação', async () => {
      const noAddressItem = {
        serviceTypeId: 'st-1',
        destinationKnownAtCreation: false,
        requiresReturn: false,
        requiresDeliveryProof: false,
        requiresCollectionRecipient: false,
        pickupSurchargeChargedToDriver: false,
      };
      const noAddressPayload = { deliveries: [noAddressItem, noAddressItem] };

      await service.createBatch(companyUser, noAddressPayload);

      expect(googleMapsService.getDistance).not.toHaveBeenCalled();
      expect(pricingService.quote).not.toHaveBeenCalled();
      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            destinationKnownAtCreation: false,
            distanceKm: null,
            totalValue: null,
            driverValue: null,
            platformValue: null,
          }),
        }),
      );
    });
  });

  it('repetir a mesma chave retoma o lote sem duplicar nenhum item', async () => {
    mockCompanyMembership(companyUser.id, 'company-1');
    prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
    googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
    pricingService.quote.mockResolvedValue({
      distanceFee: 7.5,
      subtotal: 12.5,
      returnValue: 0,
      totalValue: 12.5,
      driverValue: 10,
      platformValue: 2.5,
    });
    const keyedPayload = {
      ...idempotencyBatchPayload,
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
    };
    const persisted: Array<{
      id: string;
      companyId: string;
      batchId: string;
      status: string;
    }> = [];
    tx.delivery.create.mockImplementation(
      ({ data }: { data: { id: string; companyId: string; batchId: string; status: string } }) => {
        persisted.push({
          id: data.id,
          companyId: data.companyId,
          batchId: data.batchId,
          status: data.status,
        });
        return Promise.resolve({ id: data.id });
      },
    );
    prisma.delivery.findMany.mockImplementation(() => Promise.resolve(persisted));
    prisma.delivery.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(fullDeliveryRow({ id: where.id, batchId: persisted[0]?.batchId })),
    );
    dispatchService.dispatchDelivery
      .mockRejectedValueOnce(new Error('resposta perdida depois do lote'))
      .mockResolvedValueOnce(undefined);

    await expect(service.createBatch(companyUser, keyedPayload)).rejects.toThrow(
      'resposta perdida depois do lote',
    );
    const retried = await service.createBatch(companyUser, keyedPayload);

    expect(retried.deliveries.map((delivery) => delivery.id)).toEqual(
      persisted.map((delivery) => delivery.id),
    );
    expect(retried.batchId).toBe(persisted[0]?.batchId);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.delivery.create).toHaveBeenCalledTimes(2);
    expect(googleMapsService.getDistance).toHaveBeenCalledTimes(2);
    expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(2);
    expect(dispatchService.dispatchDelivery).toHaveBeenCalledTimes(2);
  });

  it('uma colisao concorrente devolve o lote vencedor completo', async () => {
    mockCompanyMembership(companyUser.id, 'company-1');
    prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
    googleMapsService.getDistance.mockResolvedValue({ distanceKm: 5, durationMinutes: 20 });
    pricingService.quote.mockResolvedValue({
      distanceFee: 7.5,
      subtotal: 12.5,
      returnValue: 0,
      totalValue: 12.5,
      driverValue: 10,
      platformValue: 2.5,
    });
    const winner: Array<{
      id: string;
      companyId: string;
      batchId: string;
      status: string;
    }> = [];
    tx.delivery.create.mockImplementation(
      ({ data }: { data: { id: string; companyId: string; batchId: string; status: string } }) => {
        winner.push({
          id: data.id,
          companyId: data.companyId,
          batchId: data.batchId,
          status: data.status,
        });
        return Promise.resolve({ id: data.id });
      },
    );
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      await callback(tx);
      throw { code: 'P2002' };
    });
    prisma.delivery.findMany.mockImplementation(() => Promise.resolve(winner));
    prisma.delivery.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(fullDeliveryRow({ id: where.id, batchId: winner[0]?.batchId })),
    );

    const result = await service.createBatch(companyUser, {
      ...idempotencyBatchPayload,
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    });

    expect(result.deliveries.map((delivery) => delivery.id)).toEqual(
      winner.map((delivery) => delivery.id),
    );
    expect(dispatchService.dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.emitDeliveryUpdated).not.toHaveBeenCalled();
  });

  describe('list', () => {
    it('admin vê todos os pedidos, sem filtro de companyId', async () => {
      prisma.delivery.findMany.mockResolvedValue([fullDeliveryRow()]);

      await service.list(adminUser, {});

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('empresa só vê os próprios pedidos (companyId no filtro)', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findMany.mockResolvedValue([]);

      await service.list(companyUser, {});

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1' } }),
      );
    });

    it('motoboy vê apenas os pedidos atribuídos a ele', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findMany.mockResolvedValue([]);

      await service.list(driverUser, {});

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverId: driverRow.id } }),
      );
    });

    it('repassa o filtro de status', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findMany.mockResolvedValue([]);

      await service.list(companyUser, { status: 'CANCELLED' });

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1', status: 'CANCELLED' } }),
      );
    });
  });

  describe('summary', () => {
    beforeEach(() => {
      prisma.$transaction.mockImplementation(async (input: unknown) =>
        Array.isArray(input)
          ? Promise.all(input)
          : (input as (transaction: typeof tx) => unknown)(tx),
      );
    });

    it('agrega contagens e valores no escopo administrativo informado', async () => {
      prisma.delivery.groupBy.mockResolvedValue([
        { status: 'COMPLETED', _count: { _all: 4 } },
        { status: 'CANCELLED', _count: { _all: 2 } },
      ]);
      prisma.delivery.aggregate
        .mockResolvedValueOnce({
          _count: { _all: 8 },
          _sum: { totalValue: { toString: () => '123.45' } },
        })
        .mockResolvedValueOnce({
          _sum: {
            totalValue: { toString: () => '80.00' },
            driverValue: { toString: () => '60.00' },
            platformValue: { toString: () => '20.00' },
          },
        });

      const result = await service.summary(adminUser, { companyId: 'company-1' });

      expect(prisma.delivery.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1' } }),
      );
      expect(prisma.delivery.aggregate).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1', status: 'COMPLETED' } }),
      );
      expect(result).toEqual({
        totalCount: 8,
        counts: { COMPLETED: 4, CANCELLED: 2 },
        totalValue: 123.45,
        completedTotalValue: 80,
        completedDriverValue: 60,
        completedPlatformValue: 20,
      });
    });

    it('mantem empresa no proprio escopo quando nao ha filtro administrativo', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.groupBy.mockResolvedValue([]);
      prisma.delivery.aggregate
        .mockResolvedValueOnce({ _count: { _all: 0 }, _sum: { totalValue: null } })
        .mockResolvedValueOnce({
          _sum: { totalValue: null, driverValue: null, platformValue: null },
        });

      await expect(service.summary(companyUser, {})).resolves.toEqual({
        totalCount: 0,
        counts: {},
        totalValue: 0,
        completedTotalValue: 0,
        completedDriverValue: 0,
        completedPlatformValue: 0,
      });
      expect(prisma.delivery.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1' } }),
      );
    });

    it('recusa filtro explicito de empresa fora do perfil administrativo', async () => {
      await expect(service.summary(companyUser, { companyId: 'company-1' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.delivery.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('operations', () => {
    beforeEach(() => {
      prisma.delivery.findMany.mockResolvedValue([]);
      prisma.$transaction.mockImplementation(async (input: unknown) =>
        Array.isArray(input)
          ? Promise.all(input)
          : (input as (transaction: typeof tx) => unknown)(tx),
      );
    });

    it('entrega a foto do motoboy junto da posicao dele', async () => {
      /**
       * E o que o mapa da loja desenha no marcador: a loja ve o rosto de quem
       * esta com o pedido dela. Sem o campo, o marcador cai para as iniciais —
       * entao ele precisa chegar, mesmo nulo.
       */
      prisma.delivery.findMany.mockResolvedValue([
        {
          id: 'pedido-1',
          displayNumber: 1,
          companyId: 'empresa-1',
          company: { tradeName: 'Loja' },
          serviceType: { name: 'motoboy' },
          status: 'COLLECTED',
          statusChangedAt: new Date('2026-08-23T15:00:00.000Z'),
          createdAt: new Date('2026-08-23T14:00:00.000Z'),
          scheduledAt: null,
          distanceKm: null,
          totalValue: null,
          driverValue: null,
          platformValue: null,
          returnValue: null,
          surchargeLabel: null,
          surchargeValue: null,
          paymentMethod: 'BILLED',
          customerPaymentMethod: null,
          requiresReturn: false,
          requiresDeliveryProof: false,
          requiresCollectionRecipient: false,
          destinationKnownAtCreation: true,
          externalOrderNumber: null,
          recipientName: null,
          recipientPhone: null,
          driverNote: null,
          failureReason: null,
          failureNote: null,
          failedAt: null,
          batchId: null,
          invoiceId: null,
          pickupSurchargeChargedToDriver: false,
          addresses: [],
          trackingPoints: [],
          driver: {
            id: 'motoboy-1',
            user: {
              name: 'Franklim Melo',
              phone: '33999887766',
              avatarUrl: 'https://ik.imagekit.io/exemplo/foto.jpg',
            },
          },
        },
      ]);

      const resultado = await service.operations(adminUser, {});

      const pedido = [...resultado.active, ...resultado.recent][0];
      expect(pedido?.driver).toEqual(
        expect.objectContaining({ avatarUrl: 'https://ik.imagekit.io/exemplo/foto.jpg' }),
      );
    });

    it('preserva por padrao os 20 concluidos ou cancelados mais recentes', async () => {
      await service.operations(adminUser, {});

      expect(prisma.delivery.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['COMPLETED', 'CANCELLED'] } }),
          orderBy: { statusChangedAt: 'desc' },
          take: 20,
        }),
      );
    });

    it('mantem todos os terminais quando a empresa acompanha um lote especifico', async () => {
      const batchId = '22222222-2222-4222-8222-222222222222';
      mockCompanyMembership(companyUser.id, 'company-1');

      await service.operations(companyUser, { batchId });

      expect(prisma.delivery.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1', batchId }),
        }),
      );
      const recentQuery = prisma.delivery.findMany.mock.calls[1]?.[0];
      expect(recentQuery).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1', batchId }),
          orderBy: { statusChangedAt: 'desc' },
        }),
      );
      expect(recentQuery).not.toHaveProperty('take');
      expect(prisma.delivery.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: { companyId: 'company-1', batchId },
        _count: { _all: true },
      });
    });

    it('agrega as contagens por status no banco sem carregar todo o historico', async () => {
      prisma.delivery.groupBy.mockResolvedValue([
        { status: 'AWAITING_DRIVER', _count: { _all: 3 } },
        { status: 'COMPLETED', _count: { _all: 12 } },
      ]);

      const result = await service.operations(adminUser, {});

      expect(prisma.delivery.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        where: {},
        _count: { _all: true },
      });
      expect(result.counts).toEqual({ AWAITING_DRIVER: 3, COMPLETED: 12 });
    });

    it('aceita uma janela terminal sem limite por quantidade para o admin', async () => {
      const changedSince = new Date('2026-08-23T15:45:00.000Z');

      await service.operations(
        adminUser,
        {},
        {
          statuses: ['CANCELLED'],
          changedSince,
          limit: null,
        },
      );

      const recentQuery = prisma.delivery.findMany.mock.calls[1]?.[0];
      expect(recentQuery).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['CANCELLED'] },
            statusChangedAt: { gte: changedSince },
          }),
          orderBy: { statusChangedAt: 'desc' },
        }),
      );
      expect(recentQuery).not.toHaveProperty('take');
    });
  });

  describe('stageTimes', () => {
    it('le os historicos em paginas limitadas', async () => {
      prisma.delivery.findMany.mockResolvedValue([]);

      await service.stageTimes(adminUser, {
        from: '2026-01-01',
        to: '2026-12-31',
        excludeRetroactive: false,
      });

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { id: 'asc' },
          take: 500,
          select: expect.objectContaining({ id: true }),
        }),
      );
    });
  });

  describe('detail', () => {
    it('retorna 404 quando o pedido não existe', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await expect(service.detail(companyUser, 'inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('empresa dona do pedido consegue ver', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow());

      const result = await service.detail(companyUser, 'delivery-1');

      expect(result.id).toBe('delivery-1');
      expect(result.addresses).toHaveLength(2);
    });

    it('empresa que não é dona do pedido é bloqueada', async () => {
      mockCompanyMembership(otherCompanyUser.id, 'company-2');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ companyId: 'company-1' }));

      await expect(service.detail(otherCompanyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('admin consegue ver qualquer pedido', async () => {
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow());

      const result = await service.detail(adminUser, 'delivery-1');

      expect(result.id).toBe('delivery-1');
    });

    it.each([
      ['admin', adminUser],
      ['empresa dona', companyUser],
    ])('%s identifica e salva a rua de um destino capturado por GPS', async (_label, user) => {
      if (user.type === 'COMPANY_MEMBER') {
        mockCompanyMembership(user.id, 'company-1');
      }
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          destinationKnownAtCreation: false,
          status: 'COMPLETED',
          addresses: [
            {
              id: 'dropoff-gps-1',
              type: 'DROPOFF',
              street: null,
              number: null,
              complement: null,
              city: null,
              state: null,
              zip: null,
              lat: -20.1509698,
              lng: -41.6146408,
              referenceNote: null,
            },
          ],
        }),
      );
      googleMapsService.reverseGeocode.mockResolvedValue({
        street: 'Avenida Antonio Florencio Alvim',
        number: '205',
        city: 'Lajinha',
        state: 'MG',
        zip: '36980-000',
      });

      const result = await service.detail(user, 'delivery-1');

      expect(googleMapsService.reverseGeocode).toHaveBeenCalledWith({
        lat: -20.1509698,
        lng: -41.6146408,
      });
      expect(prisma.deliveryAddress.updateMany).toHaveBeenCalledWith({
        where: { id: 'dropoff-gps-1', street: null },
        data: {
          street: 'Avenida Antonio Florencio Alvim',
          number: '205',
          city: 'Lajinha',
          state: 'MG',
          zip: '36980-000',
        },
      });
      expect(result.addresses[0]).toMatchObject({
        street: 'Avenida Antonio Florencio Alvim',
        number: '205',
        city: 'Lajinha',
        state: 'MG',
        zip: '36980-000',
        lat: -20.1509698,
        lng: -41.6146408,
      });
    });

    it('mantem as coordenadas quando o Google nao consegue identificar a rua', async () => {
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          destinationKnownAtCreation: false,
          status: 'COMPLETED',
          addresses: [
            {
              id: 'dropoff-gps-1',
              type: 'DROPOFF',
              street: null,
              number: null,
              complement: null,
              city: null,
              state: null,
              zip: null,
              lat: -20.1509698,
              lng: -41.6146408,
              referenceNote: null,
            },
          ],
        }),
      );
      googleMapsService.reverseGeocode.mockRejectedValue(new Error('Google indisponivel'));

      const result = await service.detail(adminUser, 'delivery-1');

      expect(result.addresses[0]).toMatchObject({
        street: null,
        lat: -20.1509698,
        lng: -41.6146408,
      });
      expect(prisma.deliveryAddress.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('redispatch', () => {
    it('retorna 404 quando o pedido não existe', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await expect(service.redispatch(companyUser, 'inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('recusa quem não é da empresa dona do pedido', async () => {
      mockCompanyMembership(otherCompanyUser.id, 'company-2');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status: 'AWAITING_DRIVER' }));

      await expect(service.redispatch(otherCompanyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(dispatchService.dispatchDelivery).not.toHaveBeenCalled();
    });

    it.each(['ACCEPTED', 'COLLECTED', 'DELIVERED', 'COMPLETED', 'CANCELLED'] as const)(
      'recusa reenviar um pedido em %s',
      async (status) => {
        mockCompanyMembership(companyUser.id, 'company-1');
        prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status }));

        await expect(service.redispatch(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
          ConflictException,
        );
        // O que importa aqui: um pedido ja aceito NAO pode ser reofertado, ou
        // dois motoboys apareceriam para a mesma entrega.
        expect(dispatchService.dispatchDelivery).not.toHaveBeenCalled();
      },
    );

    it('reenvia um pedido AWAITING_DRIVER ao despacho', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status: 'AWAITING_DRIVER' }));

      await service.redispatch(companyUser, 'delivery-1');

      expect(dispatchService.dispatchDelivery).toHaveBeenCalledWith('delivery-1');
    });
  });

  describe('cancel', () => {
    it('retorna 404 quando o pedido não existe', async () => {
      prisma.delivery.findUnique.mockResolvedValue(null);

      await expect(service.cancel(companyUser, 'inexistente')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejeita cancelar um pedido já CANCELLED', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status: 'CANCELLED' }));

      await expect(service.cancel(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejeita cancelar um pedido já COMPLETED', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status: 'COMPLETED' }));

      await expect(service.cancel(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('empresa cancela um pedido AWAITING_DRIVER com sucesso', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'AWAITING_DRIVER' }))
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'CANCELLED' }));

      const result = await service.cancel(companyUser, 'delivery-1');

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'AWAITING_DRIVER' },
        data: { status: 'CANCELLED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'AWAITING_DRIVER',
          toStatus: 'CANCELLED',
          changedByUserId: companyUser.id,
          // A loja cancela sem motivo pelo aplicativo, e isso continua valendo:
          // o campo existe e fica nulo. Quem exige texto e a tela do admin.
          note: null,
        },
      });
      expect(result.status).toBe('CANCELLED');
      expect(dispatchService.cancelPendingOfferForDelivery).toHaveBeenCalledWith('delivery-1');
      expect(dispatchService.cancelScheduledActivation).not.toHaveBeenCalled();
    });

    it('cancelar um pedido SCHEDULED cancela a ativação agendada em vez da oferta', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'SCHEDULED' }))
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'CANCELLED' }));

      await service.cancel(companyUser, 'delivery-1');

      expect(dispatchService.cancelScheduledActivation).toHaveBeenCalledWith('delivery-1');
      expect(dispatchService.cancelPendingOfferForDelivery).not.toHaveBeenCalled();
    });

    it('empresa não pode cancelar um pedido já ACCEPTED', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status: 'ACCEPTED' }));

      await expect(service.cancel(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('falha fechado se o pedido muda enquanto o cancelamento e confirmado', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ status: 'AWAITING_DRIVER' }));
      tx.delivery.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.cancel(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
      expect(dispatchService.cancelPendingOfferForDelivery).not.toHaveBeenCalled();
    });

    it('admin pode cancelar um pedido ACCEPTED', async () => {
      prisma.delivery.findUnique
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'ACCEPTED', driverId: 'driver-1' }))
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'CANCELLED' }));

      const result = await service.cancel(adminUser, 'delivery-1');

      expect(result.status).toBe('CANCELLED');
      expect(realtimeGateway.emitToDriver).toHaveBeenCalledWith('driver-1', 'delivery:cancelled', {
        deliveryIds: ['delivery-1'],
      });
    });

    it.each(['ACCEPTED', 'COLLECTED', 'DELIVERED', 'FAILED'] as const)(
      'motoboy pode cancelar o próprio pedido em %s',
      async (status) => {
        prisma.driver.findUnique.mockResolvedValue(driverRow);
        prisma.delivery.findUnique
          .mockResolvedValueOnce(fullDeliveryRow({ status, driverId: 'driver-1' }))
          .mockResolvedValueOnce(fullDeliveryRow({ status: 'CANCELLED', driverId: 'driver-1' }));

        await expect(
          service.cancel(driverUser, 'delivery-1', 'Cancelado pelo motoboy.'),
        ).resolves.toMatchObject({ status: 'CANCELLED' });

        expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            deliveryId: 'delivery-1',
            fromStatus: status,
            toStatus: 'CANCELLED',
            changedByUserId: driverUser.id,
            note: 'Cancelado pelo motoboy.',
          }),
        });
      },
    );

    it('motoboy não pode cancelar pedido atribuído a outro entregador', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ status: 'COLLECTED', driverId: 'driver-2' }),
      );

      await expect(service.cancel(driverUser, 'delivery-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(tx.delivery.update).not.toHaveBeenCalled();
    });

    it('empresa não pode cancelar pedido de outra empresa', async () => {
      mockCompanyMembership(otherCompanyUser.id, 'company-2');
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ companyId: 'company-1' }));

      await expect(service.cancel(otherCompanyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('cancelar um pedido de lote cancela todos os pedidos e suas ofertas', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique
        .mockResolvedValueOnce(fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1' }))
        .mockResolvedValueOnce(
          fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'CANCELLED' }),
        );
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1' }),
        fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1' }),
      ]);

      await service.cancel(companyUser, 'delivery-1');

      expect(tx.delivery.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'delivery-2', status: 'AWAITING_DRIVER' } }),
      );
      expect(dispatchService.cancelPendingOfferForDelivery).toHaveBeenCalledWith('delivery-1');
      expect(dispatchService.cancelPendingOfferForDelivery).toHaveBeenCalledWith('delivery-2');
    });

    it('lote com um item já COMPLETED: cancela só os itens ainda ativos, sem travar o lote inteiro', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique
        .mockResolvedValueOnce(
          fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'AWAITING_DRIVER' }),
        )
        .mockResolvedValueOnce(
          fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'CANCELLED' }),
        );
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'COMPLETED' }),
        fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'AWAITING_DRIVER' }),
      ]);

      await service.cancel(companyUser, 'delivery-2');

      expect(tx.delivery.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.delivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'delivery-2', status: 'AWAITING_DRIVER' } }),
      );
      expect(dispatchService.cancelPendingOfferForDelivery).toHaveBeenCalledWith('delivery-2');
      expect(dispatchService.cancelPendingOfferForDelivery).not.toHaveBeenCalledWith('delivery-1');
    });

    it('lote onde todos os itens já estão CANCELLED/COMPLETED: rejeita (nada pra cancelar)', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'COMPLETED' }),
      );
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'COMPLETED' }),
        fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'CANCELLED' }),
      ]);

      await expect(service.cancel(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.delivery.update).not.toHaveBeenCalled();
    });
  });

  describe('collect', () => {
    it('rejeita quem não é motoboy', async () => {
      await expect(service.collect(companyUser, 'delivery-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('retorna 404 quando o pedido não existe', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(null);

      await expect(service.collect(driverUser, 'delivery-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejeita quando o pedido não está atribuído a este motoboy', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ driverId: 'outro-driver' }));

      await expect(service.collect(driverUser, 'delivery-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejeita se algum item do lote ainda não está ACCEPTED', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', batchId: 'batch-1', status: 'ACCEPTED' }),
      );
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({
          id: 'delivery-1',
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'ACCEPTED',
        }),
        fullDeliveryRow({
          id: 'delivery-2',
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'AWAITING_DRIVER',
        }),
      ]);

      await expect(service.collect(driverUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('transição atômica ACCEPTED -> COLLECTED pra todos os itens do lote', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          fullDeliveryRow({
            id: where.id,
            driverId: 'driver-1',
            batchId: 'batch-1',
            status: 'COLLECTED',
          }),
        ),
      );
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({
          id: 'delivery-1',
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'ACCEPTED',
        }),
        fullDeliveryRow({
          id: 'delivery-2',
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'ACCEPTED',
        }),
      ]);

      const result = await service.collect(driverUser, 'delivery-1');

      expect(tx.delivery.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'ACCEPTED', driverId: 'driver-1' },
        data: { status: 'COLLECTED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'ACCEPTED',
          toStatus: 'COLLECTED',
          changedByUserId: driverUser.id,
        },
      });
      expect(result.deliveries).toHaveLength(2);
    });

    it('rejeita coleta fora do raio configurado', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'ACCEPTED' }),
      );
      platformSettingsService.get.mockResolvedValue({
        businessHoursEnabled: false,
        collectionProximityRadiusMeters: 200,
      });
      prisma.companyAddress.findFirst.mockResolvedValue({
        ...pickupAddress,
        lat: -20.15,
        lng: -41.74,
      });

      await expect(
        service.collect(driverUser, 'delivery-1', { lat: -21, lng: -42, accuracy: 10 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
    });

    it('registra a distância quando a coleta está dentro do raio configurado', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      const accepted = fullDeliveryRow({ driverId: 'driver-1', status: 'ACCEPTED' });
      const collected = fullDeliveryRow({ driverId: 'driver-1', status: 'COLLECTED' });
      prisma.delivery.findUnique.mockResolvedValueOnce(accepted).mockResolvedValue(collected);
      platformSettingsService.get.mockResolvedValue({
        businessHoursEnabled: false,
        collectionProximityRadiusMeters: 200,
      });
      prisma.companyAddress.findFirst.mockResolvedValue({
        ...pickupAddress,
        lat: -20.15,
        lng: -41.74,
      });

      await service.collect(driverUser, 'delivery-1', {
        lat: -20.15,
        lng: -41.74,
        accuracy: 10,
      });

      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'delivery-1',
          note: expect.stringContaining('Coleta validada a 0m'),
        }),
      });
    });

    it('devolve o estado coletado sem criar outro histórico quando a resposta se perdeu', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      const collected = fullDeliveryRow({
        driverId: 'driver-1',
        status: 'COLLECTED',
        batchId: null,
      });
      prisma.delivery.findUnique.mockResolvedValue(collected);

      await expect(service.collect(driverUser, 'delivery-1')).resolves.toMatchObject({
        deliveries: [expect.objectContaining({ id: 'delivery-1', status: 'COLLECTED' })],
      });
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('markFailed', () => {
    const failurePayload = {
      reason: 'RECIPIENT_ABSENT' as const,
      lat: -20.15,
      lng: -41.74,
      accuracy: 10,
    };

    it('cobra o retorno no insucesso, repassa 100% ao motoboy e mantém a plataforma', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'COLLECTED' }),
      );
      pricingService.quote.mockResolvedValue({ returnValue: 3 });

      await service.markFailed(driverUser, 'delivery-1', failurePayload);

      expect(pricingService.quote).toHaveBeenCalledWith({
        companyId: 'company-1',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        distanceKm: 5,
        requiresReturn: true,
        at: expect.any(Date),
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'COLLECTED', driverId: 'driver-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'RECIPIENT_ABSENT',
          requiresReturn: true,
          returnValue: 3,
          totalValue: 15.5,
          driverValue: 13,
          platformValue: 2.5,
        }),
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(1);
      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });

    it('calcula destino e valor já com retorno quando o destino é definido no insucesso', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      const collected = fullDeliveryRow({
        driverId: 'driver-1',
        serviceTypeId: 'st-1',
        status: 'COLLECTED',
        destinationKnownAtCreation: false,
        distanceKm: null,
        totalValue: null,
        driverValue: null,
        platformValue: null,
        addresses: [fullDeliveryRow().addresses[0]],
      });
      const failed = fullDeliveryRow({
        ...collected,
        status: 'FAILED',
        failedAt: new Date('2026-08-25T16:00:00.000Z'),
        distanceKm: { toString: () => '8.00' },
        totalValue: { toString: () => '17.00' },
        driverValue: { toString: () => '14.00' },
        platformValue: { toString: () => '3.00' },
      });
      prisma.delivery.findUnique.mockResolvedValueOnce(collected).mockResolvedValue(failed);
      prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 8, durationMinutes: 25 });
      pricingService.quote.mockResolvedValue({
        chargeableDistanceKm: 8,
        distanceFee: 12,
        subtotal: 17,
        returnValue: 3,
        surchargeLabel: null,
        surchargeValue: 0,
        totalValue: 20,
        driverValue: 17,
        platformValue: 3,
      });

      await service.markFailed(driverUser, 'delivery-1', failurePayload);

      expect(googleMapsService.getDistance).toHaveBeenCalledWith({
        origin: { address: expect.stringContaining('Rua da Loja') },
        destination: { lat: failurePayload.lat, lng: failurePayload.lng },
      });
      expect(pricingService.quote).toHaveBeenCalledWith({
        companyId: 'company-1',
        regionId: 'region-1',
        serviceTypeId: 'st-1',
        distanceKm: 8,
        requiresReturn: true,
        at: expect.any(Date),
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'COLLECTED', driverId: 'driver-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          requiresReturn: true,
          distanceKm: 8,
          totalValue: 20,
          driverValue: 17,
          platformValue: 3,
          returnValue: 3,
        }),
      });
      expect(tx.deliveryAddress.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'delivery-1',
          type: 'DROPOFF',
          lat: failurePayload.lat,
          lng: failurePayload.lng,
        }),
      });
      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });

    it('não duplica a taxa quando o pedido já nasceu com retorno', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'COLLECTED',
          requiresReturn: true,
          returnValue: { toString: () => '3.00' },
          totalValue: { toString: () => '15.50' },
          driverValue: { toString: () => '13.00' },
        }),
      );

      await service.markFailed(driverUser, 'delivery-1', failurePayload);

      expect(pricingService.quote).not.toHaveBeenCalled();
      const updateData = tx.delivery.updateMany.mock.calls[0]?.[0].data;
      expect(updateData).toEqual(
        expect.objectContaining({ status: 'FAILED', requiresReturn: true }),
      );
      expect(updateData).not.toHaveProperty('totalValue');
      expect(updateData).not.toHaveProperty('driverValue');
      expect(updateData).not.toHaveProperty('platformValue');
      expect(updateData).not.toHaveProperty('returnValue');
    });

    it('não registra o insucesso quando não existe taxa de retorno configurada', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'COLLECTED' }),
      );
      pricingService.quote.mockRejectedValue(new ReturnNotSupportedError());

      await expect(
        service.markFailed(driverUser, 'delivery-1', failurePayload),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
    });

    it('converge para o insucesso vencedor quando outra chamada cobra primeiro', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      const collected = fullDeliveryRow({ driverId: 'driver-1', status: 'COLLECTED' });
      const failed = fullDeliveryRow({
        driverId: 'driver-1',
        status: 'FAILED',
        failedAt: new Date('2026-08-28T15:00:00.000Z'),
        requiresReturn: true,
        returnValue: { toString: () => '3.00' },
        totalValue: { toString: () => '15.50' },
        driverValue: { toString: () => '13.00' },
      });
      prisma.delivery.findUnique.mockResolvedValueOnce(collected).mockResolvedValue(failed);
      pricingService.quote.mockResolvedValue({ returnValue: 3 });
      tx.delivery.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.markFailed(driverUser, 'delivery-1', failurePayload),
      ).resolves.toMatchObject({ status: 'FAILED', requiresReturn: true, returnValue: 3 });

      expect(pricingService.quote).toHaveBeenCalledTimes(1);
      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });

    it('não registra insucesso sem GPS quando ele é necessário para calcular o valor', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          serviceTypeId: 'st-1',
          status: 'COLLECTED',
          destinationKnownAtCreation: false,
          distanceKm: null,
          totalValue: null,
          driverValue: null,
          platformValue: null,
        }),
      );

      await expect(
        service.markFailed(driverUser, 'delivery-1', {
          reason: 'OTHER',
          note: 'Problema informado pelo motoboy.',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
      expect(pricingService.quote).not.toHaveBeenCalled();
      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });

    it('devolve o insucesso existente sem criar outro histórico no retry', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'FAILED',
          failedAt: new Date('2026-08-24T12:00:00.000Z'),
        }),
      );

      await expect(
        service.markFailed(driverUser, 'delivery-1', failurePayload),
      ).resolves.toBeDefined();
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(tx.deliveryStatusHistory.create).not.toHaveBeenCalled();
      expect(pricingService.quote).not.toHaveBeenCalled();
    });
  });

  describe('markDelivered', () => {
    it('devolve a entrega já concluída sem cobrar ou gravar novamente', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'COMPLETED', failedAt: null }),
      );

      await expect(service.markDelivered(driverUser, 'delivery-1', {})).resolves.toMatchObject({
        id: 'delivery-1',
        status: 'COMPLETED',
      });
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      expect(financeLedgerService.creditDriverRepasse).not.toHaveBeenCalled();
    });

    it('rejeita se o pedido não está COLLECTED', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'ACCEPTED' }),
      );

      await expect(service.markDelivered(driverUser, 'delivery-1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    describe('autonomia com endereço informado', () => {
      // Lajinha, centro. O segundo ponto fica ~1,5 km ao norte.
      const DESTINO = { lat: -20.1389, lng: -41.6069 };
      const LONGE = { lat: -20.1255, lng: -41.6069 };

      function pedidoComDestinoConhecido() {
        prisma.driver.findUnique.mockResolvedValue(driverRow);
        prisma.delivery.findUnique.mockResolvedValue(
          fullDeliveryRow({
            driverId: 'driver-1',
            status: 'COLLECTED',
            destinationKnownAtCreation: true,
            requiresReturn: false,
          }),
        );
        prisma.deliveryAddress.findFirst.mockResolvedValue({
          lat: DESTINO.lat,
          lng: DESTINO.lng,
          street: 'Rua Sucupira',
          number: '11',
        });
        platformSettingsService.get.mockResolvedValue({
          businessHoursEnabled: false,
          deliveryProximityRadiusMeters: 200,
        });
      }

      it('rejeita a confirmação quando o GPS está longe', async () => {
        pedidoComDestinoConhecido();

        await expect(
          service.markDelivered(driverUser, 'delivery-1', { ...LONGE, accuracy: 10 }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(tx.delivery.updateMany).not.toHaveBeenCalled();
      });

      it('aceita quando está dentro do raio', async () => {
        pedidoComDestinoConhecido();

        await expect(
          service.markDelivered(driverUser, 'delivery-1', { ...DESTINO, accuracy: 10 }),
        ).resolves.toBeDefined();
      });

      it('rejeita a confirmação com GPS mais impreciso que o raio', async () => {
        pedidoComDestinoConhecido();

        await expect(
          service.markDelivered(driverUser, 'delivery-1', { ...DESTINO, accuracy: 900 }),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('também confere proximidade na marcação retroativa', async () => {
        pedidoComDestinoConhecido();

        await expect(
          service.markDelivered(driverUser, 'delivery-1', {
            ...LONGE,
            accuracy: 10,
            occurredAt: new Date(Date.now() - 20 * 60_000).toISOString(),
          }),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('rejeita quando o endereço não tem coordenada', async () => {
        pedidoComDestinoConhecido();
        prisma.deliveryAddress.findFirst.mockResolvedValue({
          lat: null,
          lng: null,
          street: 'Rua Inexistente',
          number: '1',
        });

        await expect(
          service.markDelivered(driverUser, 'delivery-1', { ...LONGE, accuracy: 10 }),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('rejeita quando o app não envia posição', async () => {
        pedidoComDestinoConhecido();

        await expect(service.markDelivered(driverUser, 'delivery-1', {})).rejects.toBeInstanceOf(
          ConflictException,
        );
      });

      it('respeita o raio ampliado pelo admin', async () => {
        pedidoComDestinoConhecido();
        platformSettingsService.get.mockResolvedValue({
          businessHoursEnabled: false,
          deliveryProximityRadiusMeters: 3000,
        });

        await expect(
          service.markDelivered(driverUser, 'delivery-1', { ...LONGE, accuracy: 10 }),
        ).resolves.toBeDefined();
        expect(platformSettingsService.get).toHaveBeenCalledTimes(1);
      });
    });

    it('destino conhecido, sem retorno: fecha sozinho (COMPLETED) e registra as duas transições', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'COLLECTED',
          destinationKnownAtCreation: true,
          requiresReturn: false,
        }),
      );

      await service.markDelivered(driverUser, 'delivery-1', {});

      expect(googleMapsService.getDistance).not.toHaveBeenCalled();
      expect(tx.deliveryAddress.create).not.toHaveBeenCalled();
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'COLLECTED', driverId: 'driver-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'COLLECTED',
          toStatus: 'DELIVERED',
          changedByUserId: driverUser.id,
        },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'DELIVERED',
          toStatus: 'COMPLETED',
          changedByUserId: driverUser.id,
        },
      });
      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ id: 'delivery-1', driverId: 'driver-1', driverValue: 10 }),
      );
    });

    it('destino conhecido, com retorno: fica em DELIVERED, só uma transição', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'COLLECTED',
          destinationKnownAtCreation: true,
          requiresReturn: true,
        }),
      );

      await service.markDelivered(driverUser, 'delivery-1', {});

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'COLLECTED', driverId: 'driver-1' },
        data: expect.objectContaining({ status: 'DELIVERED' }),
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(1);
    });

    it('sem destino conhecido: exige lat/lng no corpo', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'COLLECTED',
          destinationKnownAtCreation: false,
        }),
      );

      await expect(service.markDelivered(driverUser, 'delivery-1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('sem destino conhecido: calcula distância/preço a partir do lat/lng informado e cria o DROPOFF', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'COLLECTED',
          destinationKnownAtCreation: false,
          requiresReturn: false,
          serviceType: { name: 'Moto' },
        }),
      );
      prisma.companyAddress.findFirst.mockResolvedValue(pickupAddress);
      googleMapsService.getDistance.mockResolvedValue({ distanceKm: 8, durationMinutes: 25 });
      pricingService.quote.mockResolvedValue({
        distanceFee: 12,
        subtotal: 17,
        returnValue: 0,
        totalValue: 17,
        driverValue: 14,
        platformValue: 3,
      });

      await service.markDelivered(driverUser, 'delivery-1', { lat: -20.15, lng: -41.74 });

      expect(googleMapsService.getDistance).toHaveBeenCalledWith({
        origin: { address: expect.stringContaining('Rua da Loja') },
        destination: { lat: -20.15, lng: -41.74 },
      });
      expect(tx.deliveryAddress.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'DROPOFF',
          street: null,
          city: null,
          lat: -20.15,
          lng: -41.74,
        }),
      });
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'COLLECTED', driverId: 'driver-1' },
        data: expect.objectContaining({
          distanceKm: 8,
          totalValue: 17,
          driverValue: 14,
          platformValue: 3,
        }),
      });
    });
  });

  describe('completeReturn', () => {
    const nearPickup = { lat: -20.15, lng: -41.74, accuracy: 10 };

    it('devolve o retorno já concluído sem exigir outro fix de GPS', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'COMPLETED',
          requiresReturn: true,
          batchId: null,
        }),
      );

      await expect(
        service.completeReturn(driverUser, 'delivery-1', nearPickup),
      ).resolves.toMatchObject({
        deliveries: [expect.objectContaining({ id: 'delivery-1', status: 'COMPLETED' })],
      });
      expect(platformSettingsService.get).not.toHaveBeenCalled();
      expect(tx.delivery.updateMany).not.toHaveBeenCalled();
    });

    it('conclui sem exigir raio de retorno configurado', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'DELIVERED',
          requiresReturn: true,
        }),
      );
      platformSettingsService.get.mockResolvedValue({
        returnProximityRadiusMeters: null,
        businessHoursEnabled: false,
      });

      await expect(service.completeReturn(driverUser, 'delivery-1', {})).resolves.toBeDefined();
      expect(platformSettingsService.get).toHaveBeenCalledTimes(1);
      expect(prisma.companyAddress.findFirst).not.toHaveBeenCalled();
    });

    it('rejeita quando o raio está ativo e a empresa não tem coordenadas cadastradas', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'DELIVERED',
          requiresReturn: true,
        }),
      );
      platformSettingsService.get.mockResolvedValue({
        returnProximityRadiusMeters: 200,
        businessHoursEnabled: false,
      });
      prisma.companyAddress.findFirst.mockResolvedValue({ ...pickupAddress, lat: null, lng: null });

      await expect(
        service.completeReturn(driverUser, 'delivery-1', nearPickup),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita quando a posição informada está longe', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          status: 'DELIVERED',
          requiresReturn: true,
        }),
      );
      platformSettingsService.get.mockResolvedValue({
        returnProximityRadiusMeters: 200,
        businessHoursEnabled: false,
      });
      prisma.companyAddress.findFirst.mockResolvedValue({
        ...pickupAddress,
        lat: -20.15,
        lng: -41.74,
      });

      await expect(
        service.completeReturn(driverUser, 'delivery-1', { lat: -21, lng: -42, accuracy: 10 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita quando não há entregas aguardando retorno', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'DELIVERED',
          requiresReturn: false,
        }),
      );
      platformSettingsService.get.mockResolvedValue({
        returnProximityRadiusMeters: 200,
        businessHoursEnabled: false,
      });
      prisma.companyAddress.findFirst.mockResolvedValue({
        ...pickupAddress,
        lat: -20.15,
        lng: -41.74,
      });
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({
          id: 'delivery-1',
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'DELIVERED',
          requiresReturn: false,
        }),
      ]);

      await expect(
        service.completeReturn(driverUser, 'delivery-1', { lat: -20.15, lng: -41.74 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('fecha só os itens DELIVERED+requiresReturn, sem mexer nos demais', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ id: 'delivery-1', driverId: 'driver-1', batchId: 'batch-1' }),
      );
      platformSettingsService.get.mockResolvedValue({
        returnProximityRadiusMeters: 200,
        businessHoursEnabled: false,
      });
      prisma.companyAddress.findFirst.mockResolvedValue({
        ...pickupAddress,
        lat: -20.15,
        lng: -41.74,
      });
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({
          id: 'delivery-1',
          driverId: 'driver-1',
          batchId: 'batch-1',
          status: 'DELIVERED',
          requiresReturn: true,
        }),
        fullDeliveryRow({
          id: 'delivery-2',
          batchId: 'batch-1',
          status: 'DELIVERED',
          requiresReturn: false,
        }),
        fullDeliveryRow({
          id: 'delivery-3',
          batchId: 'batch-1',
          status: 'COMPLETED',
          requiresReturn: true,
        }),
      ]);

      const result = await service.completeReturn(driverUser, 'delivery-1', {
        lat: -20.15,
        lng: -41.74,
        accuracy: 10,
      });

      expect(tx.delivery.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'DELIVERED', driverId: 'driver-1' },
        data: { status: 'COMPLETED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryId: 'delivery-1', toStatus: 'COMPLETED' }),
        }),
      );
      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ id: 'delivery-1', driverId: 'driver-1' }),
      );
      expect(result.deliveries).toHaveLength(1);
    });

    it('fecha o insucesso com o mesmo motoboy e credita uma única vez o valor com retorno', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      const failed = fullDeliveryRow({
        driverId: 'driver-1',
        status: 'FAILED',
        failedAt: new Date('2026-08-25T16:00:00.000Z'),
        requiresReturn: true,
        returnValue: { toString: () => '3.00' },
        driverValue: { toString: () => '17.00' },
      });
      const completed = fullDeliveryRow({
        ...failed,
        status: 'COMPLETED',
      });
      prisma.delivery.findUnique.mockResolvedValueOnce(failed).mockResolvedValue(completed);

      const result = await service.completeReturn(driverUser, 'delivery-1', {});

      expect(tx.delivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'delivery-1', status: 'FAILED', driverId: 'driver-1' },
        data: { status: 'COMPLETED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'FAILED',
          toStatus: 'COMPLETED',
          changedByUserId: driverUser.id,
          note: 'Retorno confirmado pelo motoboy.',
        },
      });
      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledTimes(1);
      expect(financeLedgerService.creditDriverRepasse).toHaveBeenCalledWith(tx, {
        id: 'delivery-1',
        driverId: 'driver-1',
        driverValue: failed.driverValue,
      });
      expect(result.deliveries).toEqual([
        expect.objectContaining({ id: 'delivery-1', status: 'COMPLETED' }),
      ]);
    });
  });
});
