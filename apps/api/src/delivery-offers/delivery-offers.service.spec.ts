import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { User } from '@prisma/client';
import { DispatchService } from '../dispatch/dispatch.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryOffersService } from './delivery-offers.service';

const driverUser = { id: 'user-1', type: 'DRIVER' } as User;
const companyUser = { id: 'user-2', type: 'COMPANY_MEMBER' } as User;

describe('DeliveryOffersService', () => {
  let service: DeliveryOffersService;
  let prisma: { driver: { findUnique: jest.Mock } };
  let dispatchService: { acceptOffer: jest.Mock; declineOffer: jest.Mock };

  beforeEach(async () => {
    prisma = { driver: { findUnique: jest.fn() } };
    dispatchService = { acceptOffer: jest.fn(), declineOffer: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryOffersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DispatchService, useValue: dispatchService },
      ],
    }).compile();

    service = module.get(DeliveryOffersService);
  });

  describe('accept', () => {
    it('rejeita usuário que não é motoboy', async () => {
      await expect(service.accept(companyUser, 'offer-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(dispatchService.acceptOffer).not.toHaveBeenCalled();
    });

    it('rejeita quando não existe Driver pro usuário', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.accept(driverUser, 'offer-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('resolve o driver e delega pro DispatchService', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      dispatchService.acceptOffer.mockResolvedValue({ deliveryId: 'delivery-1', displayNumber: 5 });

      const result = await service.accept(driverUser, 'offer-1');

      expect(dispatchService.acceptOffer).toHaveBeenCalledWith('offer-1', 'driver-1', 'user-1');
      expect(result).toEqual({ deliveryId: 'delivery-1', displayNumber: 5 });
    });
  });

  describe('decline', () => {
    it('rejeita usuário que não é motoboy', async () => {
      await expect(service.decline(companyUser, 'offer-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(dispatchService.declineOffer).not.toHaveBeenCalled();
    });

    it('resolve o driver, delega pro DispatchService e retorna ok', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 'driver-1' });
      dispatchService.declineOffer.mockResolvedValue(undefined);

      const result = await service.decline(driverUser, 'offer-1');

      expect(dispatchService.declineOffer).toHaveBeenCalledWith('offer-1', 'driver-1');
      expect(result).toEqual({ ok: true });
    });
  });
});
