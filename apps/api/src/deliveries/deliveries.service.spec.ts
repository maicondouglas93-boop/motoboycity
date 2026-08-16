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
import { GoogleMapsApiError, GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
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

function fullDeliveryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'delivery-1',
    displayNumber: 1,
    companyId: 'company-1',
    driverId: null,
    company: { tradeName: 'Loja Teste' },
    serviceType: { name: 'Moto' },
    status: 'AWAITING_DRIVER',
    destinationKnownAtCreation: true,
    distanceKm: { toString: () => '5.00' },
    totalValue: { toString: () => '12.50' },
    driverValue: { toString: () => '10.00' },
    platformValue: { toString: () => '2.50' },
    requiresReturn: false,
    returnValue: null,
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
    ...overrides,
  };
}

describe('DeliveriesService', () => {
  let service: DeliveriesService;
  let prisma: {
    companyTeamMember: { findFirst: jest.Mock };
    companyAddress: { findFirst: jest.Mock };
    delivery: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    driver: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let pricingService: { quote: jest.Mock };
  let googleMapsService: { getDistance: jest.Mock };
  let dispatchService: {
    assertConfigured: jest.Mock;
    dispatchDelivery: jest.Mock;
    scheduleActivation: jest.Mock;
    cancelPendingOfferForDelivery: jest.Mock;
    cancelScheduledActivation: jest.Mock;
  };
  let platformSettingsService: { get: jest.Mock };
  let tx: {
    delivery: { create: jest.Mock; update: jest.Mock };
    deliveryAddress: { createMany: jest.Mock; create: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      delivery: { create: jest.fn(), update: jest.fn() },
      deliveryAddress: { createMany: jest.fn(), create: jest.fn() },
      deliveryStatusHistory: { create: jest.fn() },
    };
    prisma = {
      companyTeamMember: { findFirst: jest.fn() },
      companyAddress: { findFirst: jest.fn() },
      delivery: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      driver: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    pricingService = { quote: jest.fn() };
    googleMapsService = { getDistance: jest.fn() };
    dispatchService = {
      assertConfigured: jest.fn().mockResolvedValue(undefined),
      dispatchDelivery: jest.fn().mockResolvedValue(undefined),
      scheduleActivation: jest.fn().mockResolvedValue(undefined),
      cancelPendingOfferForDelivery: jest.fn().mockResolvedValue(undefined),
      cancelScheduledActivation: jest.fn().mockResolvedValue(undefined),
    };
    platformSettingsService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricingService, useValue: pricingService },
        { provide: GoogleMapsService, useValue: googleMapsService },
        { provide: DispatchService, useValue: dispatchService },
        { provide: AdminPlatformSettingsService, useValue: platformSettingsService },
      ],
    }).compile();

    service = module.get(DeliveriesService);
  });

  function mockCompanyMembership(userId: string, companyId: string, status = 'ACTIVE') {
    prisma.companyTeamMember.findFirst.mockImplementation(({ where }: { where: { userId: string } }) =>
      where.userId === userId ? { company: { id: companyId, status } } : null,
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
        data: { deliveryId: 'delivery-1', fromStatus: null, toStatus: 'AWAITING_DRIVER', changedByUserId: companyUser.id },
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

  describe('list', () => {
    it('admin vê todos os pedidos, sem filtro de companyId', async () => {
      prisma.delivery.findMany.mockResolvedValue([fullDeliveryRow()]);

      await service.list(adminUser, {});

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('empresa só vê os próprios pedidos (companyId no filtro)', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findMany.mockResolvedValue([]);

      await service.list(companyUser, {});

      expect(prisma.delivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-1' } }),
      );
    });

    it('rejeita acesso de motoboy', async () => {
      await expect(service.list(driverUser, {})).rejects.toBeInstanceOf(ForbiddenException);
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

      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { status: 'CANCELLED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith({
        data: {
          deliveryId: 'delivery-1',
          fromStatus: 'AWAITING_DRIVER',
          toStatus: 'CANCELLED',
          changedByUserId: companyUser.id,
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

    it('admin pode cancelar um pedido ACCEPTED', async () => {
      prisma.delivery.findUnique
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'ACCEPTED' }))
        .mockResolvedValueOnce(fullDeliveryRow({ status: 'CANCELLED' }));

      const result = await service.cancel(adminUser, 'delivery-1');

      expect(result.status).toBe('CANCELLED');
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
        .mockResolvedValueOnce(fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'CANCELLED' }));
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1' }),
        fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1' }),
      ]);

      await service.cancel(companyUser, 'delivery-1');

      expect(tx.delivery.update).toHaveBeenCalledTimes(2);
      expect(tx.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'delivery-2' } }),
      );
      expect(dispatchService.cancelPendingOfferForDelivery).toHaveBeenCalledWith('delivery-1');
      expect(dispatchService.cancelPendingOfferForDelivery).toHaveBeenCalledWith('delivery-2');
    });

    it('lote com um item já COMPLETED: cancela só os itens ainda ativos, sem travar o lote inteiro', async () => {
      mockCompanyMembership(companyUser.id, 'company-1');
      prisma.delivery.findUnique
        .mockResolvedValueOnce(fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'AWAITING_DRIVER' }))
        .mockResolvedValueOnce(fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'CANCELLED' }));
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'COMPLETED' }),
        fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'AWAITING_DRIVER' }),
      ]);

      await service.cancel(companyUser, 'delivery-2');

      expect(tx.delivery.update).toHaveBeenCalledTimes(1);
      expect(tx.delivery.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'delivery-2' } }),
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
        fullDeliveryRow({ id: 'delivery-1', driverId: 'driver-1', batchId: 'batch-1', status: 'ACCEPTED' }),
        fullDeliveryRow({ id: 'delivery-2', driverId: 'driver-1', batchId: 'batch-1', status: 'AWAITING_DRIVER' }),
      ]);

      await expect(service.collect(driverUser, 'delivery-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('transição atômica ACCEPTED -> COLLECTED pra todos os itens do lote', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          fullDeliveryRow({ id: where.id, driverId: 'driver-1', batchId: 'batch-1', status: 'COLLECTED' }),
        ),
      );
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', driverId: 'driver-1', batchId: 'batch-1', status: 'ACCEPTED' }),
        fullDeliveryRow({ id: 'delivery-2', driverId: 'driver-1', batchId: 'batch-1', status: 'ACCEPTED' }),
      ]);

      const result = await service.collect(driverUser, 'delivery-1');

      expect(tx.delivery.update).toHaveBeenCalledTimes(2);
      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
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
  });

  describe('markDelivered', () => {
    it('rejeita se o pedido não está COLLECTED', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'ACCEPTED' }),
      );

      await expect(service.markDelivered(driverUser, 'delivery-1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
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
      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
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

      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({ status: 'DELIVERED' }),
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledTimes(1);
    });

    it('sem destino conhecido: exige lat/lng no corpo', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', status: 'COLLECTED', destinationKnownAtCreation: false }),
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
      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
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
    const nearPickup = { lat: -20.15, lng: -41.74 };

    it('rejeita quando o raio de retorno ainda não foi configurado', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ driverId: 'driver-1' }));
      platformSettingsService.get.mockResolvedValue({ returnProximityRadiusMeters: null });

      await expect(
        service.completeReturn(driverUser, 'delivery-1', nearPickup),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita quando a empresa não tem coordenadas cadastradas', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ driverId: 'driver-1' }));
      platformSettingsService.get.mockResolvedValue({ returnProximityRadiusMeters: 200 });
      prisma.companyAddress.findFirst.mockResolvedValue({ ...pickupAddress, lat: null, lng: null });

      await expect(
        service.completeReturn(driverUser, 'delivery-1', nearPickup),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita quando o motoboy está fora do raio configurado', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(fullDeliveryRow({ driverId: 'driver-1' }));
      platformSettingsService.get.mockResolvedValue({ returnProximityRadiusMeters: 200 });
      prisma.companyAddress.findFirst.mockResolvedValue({ ...pickupAddress, lat: -20.15, lng: -41.74 });

      await expect(
        service.completeReturn(driverUser, 'delivery-1', { lat: -21, lng: -42 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejeita quando não há entregas aguardando retorno', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ driverId: 'driver-1', batchId: 'batch-1', status: 'DELIVERED', requiresReturn: false }),
      );
      platformSettingsService.get.mockResolvedValue({ returnProximityRadiusMeters: 200 });
      prisma.companyAddress.findFirst.mockResolvedValue({ ...pickupAddress, lat: -20.15, lng: -41.74 });
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'DELIVERED', requiresReturn: false }),
      ]);

      await expect(
        service.completeReturn(driverUser, 'delivery-1', { lat: -20.15, lng: -41.74 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('fecha só os itens DELIVERED+requiresReturn, dentro do raio, sem mexer nos demais', async () => {
      prisma.driver.findUnique.mockResolvedValue(driverRow);
      prisma.delivery.findUnique.mockResolvedValue(
        fullDeliveryRow({ id: 'delivery-1', driverId: 'driver-1', batchId: 'batch-1' }),
      );
      platformSettingsService.get.mockResolvedValue({ returnProximityRadiusMeters: 200 });
      prisma.companyAddress.findFirst.mockResolvedValue({ ...pickupAddress, lat: -20.15, lng: -41.74 });
      prisma.delivery.findMany.mockResolvedValue([
        fullDeliveryRow({ id: 'delivery-1', batchId: 'batch-1', status: 'DELIVERED', requiresReturn: true }),
        fullDeliveryRow({ id: 'delivery-2', batchId: 'batch-1', status: 'DELIVERED', requiresReturn: false }),
        fullDeliveryRow({ id: 'delivery-3', batchId: 'batch-1', status: 'COMPLETED', requiresReturn: true }),
      ]);

      const result = await service.completeReturn(driverUser, 'delivery-1', { lat: -20.15, lng: -41.74 });

      expect(tx.delivery.update).toHaveBeenCalledTimes(1);
      expect(tx.delivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: { status: 'COMPLETED', statusChangedAt: expect.any(Date) },
      });
      expect(tx.deliveryStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryId: 'delivery-1', toStatus: 'COMPLETED' }),
        }),
      );
      expect(result.deliveries).toHaveLength(1);
    });
  });
});
