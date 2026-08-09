import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { GoogleMapsApiError, GoogleMapsNotConfiguredError } from '../maps/google-maps.service';
import { GoogleMapsService } from '../maps/google-maps.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveriesService } from './deliveries.service';

const companyUser = { id: 'user-company-1', type: 'COMPANY_MEMBER' } as User;
const otherCompanyUser = { id: 'user-company-2', type: 'COMPANY_MEMBER' } as User;
const adminUser = { id: 'user-admin-1', type: 'ADMIN' } as User;
const driverUser = { id: 'user-driver-1', type: 'DRIVER' } as User;

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
    company: { tradeName: 'Loja Teste' },
    serviceType: { name: 'Moto' },
    status: 'AWAITING_DRIVER',
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
    $transaction: jest.Mock;
  };
  let pricingService: { quote: jest.Mock };
  let googleMapsService: { getDistance: jest.Mock };
  let tx: {
    delivery: { create: jest.Mock; update: jest.Mock };
    deliveryAddress: { createMany: jest.Mock };
    deliveryStatusHistory: { create: jest.Mock };
  };

  beforeEach(async () => {
    tx = {
      delivery: { create: jest.fn(), update: jest.fn() },
      deliveryAddress: { createMany: jest.fn() },
      deliveryStatusHistory: { create: jest.fn() },
    };
    prisma = {
      companyTeamMember: { findFirst: jest.fn() },
      companyAddress: { findFirst: jest.fn() },
      delivery: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    pricingService = { quote: jest.fn() };
    googleMapsService = { getDistance: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricingService, useValue: pricingService },
        { provide: GoogleMapsService, useValue: googleMapsService },
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
    });

    it('usa status SCHEDULED quando scheduledAt é informado', async () => {
      await service.create(companyUser, { ...payload, scheduledAt: '2026-12-01T10:00:00.000Z' });

      expect(tx.delivery.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SCHEDULED' }) }),
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
  });
});
